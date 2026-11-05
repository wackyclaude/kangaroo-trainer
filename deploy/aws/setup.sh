#!/usr/bin/env bash
# Creates the Kangaroo Trainer server on AWS (see docs/AWS.md).
#
# Run it in AWS CloudShell, signed in to the apps-prod account, region Europe (Stockholm):
#   bash setup.sh
# Upload kt-content.tar.gz (the question bank) to CloudShell first. Running the script again is
# safe: it skips what exists and updates settings. It prints the web address at the end.
#
# What it makes (all tagged App=kangaroo):
#   - S3 buckets for the question bank (private) and backups (private, versioned; the server can only add)
#   - Parameter Store settings under /kangaroo/ (the CloudFront secret is a SecureString)
#   - an IAM role for the server: Session Manager, read the bank, add backups, nothing else
#   - a security group: 443 only from CloudFront, 80 for Let's Encrypt, no SSH
#   - an Elastic IP and a t4g.small Ubuntu 24.04 server with an encrypted 20 GB disk
#   - daily disk snapshots (kept 7 days) and a stop/start schedule for the night
#   - a CloudFront distribution: the https://….cloudfront.net address
set -euo pipefail
export AWS_REGION=eu-north-1 AWS_DEFAULT_REGION=eu-north-1 AWS_PAGER=""

EXPECTED_ACCOUNT=${EXPECTED_ACCOUNT:-872138790945}   # apps-prod
REPO=${REPO:-https://github.com/wackyclaude/kangaroo-trainer.git}
REF=${REF:-main}
STOP_AT=${STOP_AT:-22}    # local time (Europe/Amsterdam); set NIGHT_OFF=no to keep it on all night
START_AT=${START_AT:-7}
NIGHT_OFF=${NIGHT_OFF:-yes}
CONTENT_TAR=${CONTENT_TAR:-$HOME/kt-content.tar.gz}

step() { printf '\n== %s\n' "$*"; }
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
if [ "$ACCOUNT" != "$EXPECTED_ACCOUNT" ]; then
  echo "This is account $ACCOUNT, not apps-prod ($EXPECTED_ACCOUNT). Switch accounts first."; exit 1
fi
CONTENT_BUCKET=kangaroo-content-$ACCOUNT
BACKUP_BUCKET=kangaroo-backups-$ACCOUNT
TAG='Key=App,Value=kangaroo'

# ---------------------------------------------------------------- S3
make_bucket() {
  local b=$1
  if ! aws s3api head-bucket --bucket "$b" 2>/dev/null; then
    aws s3api create-bucket --bucket "$b" --create-bucket-configuration "LocationConstraint=$AWS_REGION" >/dev/null
  fi
  aws s3api put-public-access-block --bucket "$b" \
    --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  aws s3api put-bucket-versioning --bucket "$b" --versioning-configuration Status=Enabled
  aws s3api put-bucket-tagging --bucket "$b" --tagging "TagSet=[{$TAG}]"
  aws s3api put-bucket-policy --bucket "$b" --policy "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"TLSOnly\",\"Effect\":\"Deny\",\"Principal\":\"*\",\"Action\":\"s3:*\",\"Resource\":[\"arn:aws:s3:::$b\",\"arn:aws:s3:::$b/*\"],\"Condition\":{\"Bool\":{\"aws:SecureTransport\":\"false\"}}}]}"
}
step "S3 buckets"
make_bucket "$CONTENT_BUCKET"
make_bucket "$BACKUP_BUCKET"
aws s3api put-bucket-lifecycle-configuration --bucket "$CONTENT_BUCKET" --lifecycle-configuration \
  '{"Rules":[{"ID":"old-versions","Status":"Enabled","Filter":{},"NoncurrentVersionExpiration":{"NoncurrentDays":30}}]}'
aws s3api put-bucket-lifecycle-configuration --bucket "$BACKUP_BUCKET" --lifecycle-configuration \
  '{"Rules":[{"ID":"keep-a-year","Status":"Enabled","Filter":{},"Expiration":{"Days":365},"NoncurrentVersionExpiration":{"NoncurrentDays":90}}]}'

step "Question bank"
if [ -f "$CONTENT_TAR" ]; then
  tmp=$(mktemp -d)
  tar -xzf "$CONTENT_TAR" -C "$tmp"
  [ -f "$tmp/questions.json" ] || { echo "$CONTENT_TAR has no questions.json at the top."; exit 1; }
  aws s3 sync "$tmp/" "s3://$CONTENT_BUCKET/content/" --delete --only-show-errors
  rm -rf "$tmp"
  echo "uploaded $(aws s3 ls "s3://$CONTENT_BUCKET/content/" --recursive | wc -l) files"
elif ! aws s3 ls "s3://$CONTENT_BUCKET/content/questions.json" >/dev/null 2>&1; then
  echo "Upload kt-content.tar.gz to CloudShell first (Actions > Upload file), then run this again."; exit 1
else
  echo "already there"
fi

# ---------------------------------------------------------------- network
step "Network"
VPC=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
[ "$VPC" != None ] || VPC=$(aws ec2 create-default-vpc --query Vpc.VpcId --output text)
SUBNET=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC" Name=default-for-az,Values=true \
  --query 'sort_by(Subnets,&AvailabilityZone)[0].SubnetId' --output text)
SG=$(aws ec2 describe-security-groups --filters Name=group-name,Values=kangaroo-server "Name=vpc-id,Values=$VPC" \
  --query 'SecurityGroups[0].GroupId' --output text)
if [ "$SG" = None ]; then
  SG=$(aws ec2 create-security-group --group-name kangaroo-server --vpc-id "$VPC" \
    --description "Kangaroo Trainer: HTTPS from CloudFront only, HTTP for Lets Encrypt" \
    --tag-specifications "ResourceType=security-group,Tags=[{$TAG},{Key=Name,Value=kangaroo-server}]" \
    --query GroupId --output text)
  PL=$(aws ec2 describe-managed-prefix-lists --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
    --query 'PrefixLists[0].PrefixListId' --output text)
  aws ec2 authorize-security-group-ingress --group-id "$SG" --ip-permissions \
    "IpProtocol=tcp,FromPort=443,ToPort=443,PrefixListIds=[{PrefixListId=$PL,Description=CloudFront}]" \
    "IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0,Description=Lets-Encrypt}]" >/dev/null
fi
echo "vpc $VPC  subnet $SUBNET  security group $SG"

EIP_ALLOC=$(aws ec2 describe-addresses --filters Name=tag:App,Values=kangaroo --query 'Addresses[0].AllocationId' --output text)
if [ "$EIP_ALLOC" = None ]; then
  EIP_ALLOC=$(aws ec2 allocate-address --domain vpc \
    --tag-specifications "ResourceType=elastic-ip,Tags=[{$TAG},{Key=Name,Value=kangaroo}]" --query AllocationId --output text)
fi
EIP=$(aws ec2 describe-addresses --allocation-ids "$EIP_ALLOC" --query 'Addresses[0].PublicIp' --output text)
HOST="${EIP//./-}.sslip.io"
echo "fixed IP $EIP  server name $HOST"

# ---------------------------------------------------------------- settings
step "Settings (Parameter Store)"
aws ssm put-parameter --name /kangaroo/hostname --type String --value "$HOST" --overwrite >/dev/null
aws ssm put-parameter --name /kangaroo/content-bucket --type String --value "$CONTENT_BUCKET" --overwrite >/dev/null
aws ssm put-parameter --name /kangaroo/backup-bucket --type String --value "$BACKUP_BUCKET" --overwrite >/dev/null
if ! aws ssm get-parameter --name /kangaroo/origin-secret >/dev/null 2>&1; then
  aws ssm put-parameter --name /kangaroo/origin-secret --type SecureString --value "$(openssl rand -hex 32)" >/dev/null
fi
SECRET=$(aws ssm get-parameter --name /kangaroo/origin-secret --with-decryption --query Parameter.Value --output text)

# ---------------------------------------------------------------- IAM
step "Server role"
if ! aws iam get-role --role-name kangaroo-server >/dev/null 2>&1; then
  aws iam create-role --role-name kangaroo-server --description "Kangaroo Trainer server" --tags "$TAG" \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
fi
aws iam attach-role-policy --role-name kangaroo-server --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam put-role-policy --role-name kangaroo-server --policy-name kangaroo-data --policy-document "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [
    {\"Sid\": \"ReadBank\", \"Effect\": \"Allow\", \"Action\": \"s3:GetObject\", \"Resource\": \"arn:aws:s3:::$CONTENT_BUCKET/content/*\"},
    {\"Sid\": \"ListBuckets\", \"Effect\": \"Allow\", \"Action\": \"s3:ListBucket\", \"Resource\": [\"arn:aws:s3:::$CONTENT_BUCKET\", \"arn:aws:s3:::$BACKUP_BUCKET\"]},
    {\"Sid\": \"AddBackups\", \"Effect\": \"Allow\", \"Action\": \"s3:PutObject\", \"Resource\": \"arn:aws:s3:::$BACKUP_BUCKET/backups/*\"},
    {\"Sid\": \"Settings\", \"Effect\": \"Allow\", \"Action\": \"ssm:GetParameter\", \"Resource\": \"arn:aws:ssm:$AWS_REGION:$ACCOUNT:parameter/kangaroo/*\"}
  ]}"
if ! aws iam get-instance-profile --instance-profile-name kangaroo-server >/dev/null 2>&1; then
  aws iam create-instance-profile --instance-profile-name kangaroo-server --tags "$TAG" >/dev/null
  aws iam add-role-to-instance-profile --instance-profile-name kangaroo-server --role-name kangaroo-server
  sleep 15   # new instance profiles take a moment to become usable
fi

# ---------------------------------------------------------------- server
step "Server"
IID=$(aws ec2 describe-instances --filters Name=tag:App,Values=kangaroo Name=instance-state-name,Values=pending,running,stopping,stopped \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)
if [ "$IID" = None ]; then
  AMI=$(aws ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id \
    --query Parameter.Value --output text)
  USERDATA=$(mktemp)
  cat > "$USERDATA" <<UD
#!/bin/bash
set -euo pipefail
exec >/var/log/kt-bootstrap.log 2>&1
# Wait until the fixed IP is attached and the internet is reachable.
for i in \$(seq 90); do curl -fsS -o /dev/null https://github.com && break; sleep 5; done
mkdir -p /srv/kt
[ -d /srv/kt/app/.git ] || git clone "$REPO" /srv/kt/app
cd /srv/kt/app && git checkout "$REF"
bash /srv/kt/app/deploy/aws/bootstrap.sh
UD
  for _ in 1 2 3 4 5; do
    IID=$(aws ec2 run-instances --image-id "$AMI" --instance-type t4g.small --credit-specification CpuCredits=standard \
      --iam-instance-profile Name=kangaroo-server \
      --network-interfaces "DeviceIndex=0,SubnetId=$SUBNET,Groups=$SG,AssociatePublicIpAddress=false" \
      --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=20,VolumeType=gp3,Encrypted=true,DeleteOnTermination=true}' \
      --metadata-options HttpTokens=required,HttpPutResponseHopLimit=1,HttpEndpoint=enabled \
      --disable-api-termination --user-data "file://$USERDATA" \
      --tag-specifications "ResourceType=instance,Tags=[{$TAG},{Key=Name,Value=kangaroo}]" \
        "ResourceType=volume,Tags=[{$TAG},{Key=Name,Value=kangaroo-disk},{Key=Snapshot,Value=kangaroo}]" \
      --query 'Instances[0].InstanceId' --output text) && break
    echo "not ready yet, trying again in 15 s"; sleep 15
  done
  rm -f "$USERDATA"
fi
echo "server $IID"
aws ec2 wait instance-running --instance-ids "$IID" || true
ASSOC=$(aws ec2 describe-addresses --allocation-ids "$EIP_ALLOC" --query 'Addresses[0].InstanceId' --output text)
[ "$ASSOC" = "$IID" ] || aws ec2 associate-address --allocation-id "$EIP_ALLOC" --instance-id "$IID" >/dev/null
IARN="arn:aws:ec2:$AWS_REGION:$ACCOUNT:instance/$IID"

# ---------------------------------------------------------------- snapshots
step "Daily disk snapshots"
aws dlm create-default-role --resource-type snapshot >/dev/null 2>&1 || true
if [ "$(aws dlm get-lifecycle-policies --target-tags Snapshot=kangaroo --query 'length(Policies)' --output text)" = 0 ]; then
  aws dlm create-lifecycle-policy --description "kangaroo daily snapshots" --state ENABLED \
    --execution-role-arn "arn:aws:iam::$ACCOUNT:role/AWSDataLifecycleManagerDefaultRole" \
    --tags App=kangaroo \
    --policy-details '{"PolicyType":"EBS_SNAPSHOT_MANAGEMENT","ResourceTypes":["VOLUME"],"TargetTags":[{"Key":"Snapshot","Value":"kangaroo"}],
      "Schedules":[{"Name":"daily","CreateRule":{"Interval":24,"IntervalUnit":"HOURS","Times":["20:30"]},"RetainRule":{"Count":7},"CopyTags":true}]}' >/dev/null
fi
echo "every evening at 20:30 UTC, last 7 kept"

# ---------------------------------------------------------------- night schedule
step "Night schedule"
if [ "$NIGHT_OFF" = yes ]; then
  if ! aws iam get-role --role-name kangaroo-scheduler >/dev/null 2>&1; then
    aws iam create-role --role-name kangaroo-scheduler --description "Stops and starts the Kangaroo server" --tags "$TAG" \
      --assume-role-policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"scheduler.amazonaws.com\"},\"Action\":\"sts:AssumeRole\",\"Condition\":{\"StringEquals\":{\"aws:SourceAccount\":\"$ACCOUNT\"}}}]}" >/dev/null
    sleep 10
  fi
  aws iam put-role-policy --role-name kangaroo-scheduler --policy-name start-stop --policy-document \
    "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"ec2:StartInstances\",\"ec2:StopInstances\"],\"Resource\":\"$IARN\"}]}"
  SROLE="arn:aws:iam::$ACCOUNT:role/kangaroo-scheduler"
  for s in stop start; do
    if [ $s = stop ]; then hour=$STOP_AT; api=stopInstances; else hour=$START_AT; api=startInstances; fi
    args=(--name "kangaroo-$s" --schedule-expression "cron(0 $hour * * ? *)" --schedule-expression-timezone Europe/Amsterdam
      --flexible-time-window Mode=OFF
      --target "{\"Arn\":\"arn:aws:scheduler:::aws-sdk:ec2:$api\",\"RoleArn\":\"$SROLE\",\"Input\":\"{\\\"InstanceIds\\\":[\\\"$IID\\\"]}\"}")
    if aws scheduler get-schedule --name "kangaroo-$s" >/dev/null 2>&1; then
      aws scheduler update-schedule "${args[@]}" >/dev/null
    else
      aws scheduler create-schedule "${args[@]}" >/dev/null
    fi
  done
  echo "off at $STOP_AT:00, on at $START_AT:00 (Amsterdam time)"
else
  for s in stop start; do aws scheduler delete-schedule --name "kangaroo-$s" >/dev/null 2>&1 || true; done
  echo "always on"
fi

# ---------------------------------------------------------------- CloudFront
step "CloudFront"
DIST=$(aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='Kangaroo Trainer'].Id | [0]" --output text)
if [ "$DIST" = None ] || [ -z "$DIST" ]; then
  CFG=$(mktemp)
  cat > "$CFG" <<JSON
{
  "CallerReference": "kangaroo-$(date +%s)",
  "Comment": "Kangaroo Trainer",
  "Enabled": true,
  "PriceClass": "PriceClass_100",
  "HttpVersion": "http2and3",
  "IsIPV6Enabled": true,
  "Origins": {"Quantity": 1, "Items": [{
    "Id": "kangaroo-server",
    "DomainName": "$HOST",
    "CustomHeaders": {"Quantity": 1, "Items": [{"HeaderName": "X-KT-Origin", "HeaderValue": "$SECRET"}]},
    "CustomOriginConfig": {"HTTPPort": 80, "HTTPSPort": 443, "OriginProtocolPolicy": "https-only",
      "OriginSslProtocols": {"Quantity": 1, "Items": ["TLSv1.2"]}, "OriginReadTimeout": 30, "OriginKeepaliveTimeout": 5}
  }]},
  "DefaultCacheBehavior": {
    "TargetOriginId": "kangaroo-server",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {"Quantity": 7, "Items": ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
      "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]}},
    "Compress": false,
    "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
    "OriginRequestPolicyId": "b689b0a8-53d0-40ab-baf2-68738e2966ac"
  },
  "ViewerCertificate": {"CloudFrontDefaultCertificate": true}
}
JSON
  DIST=$(aws cloudfront create-distribution --distribution-config "file://$CFG" --query Distribution.Id --output text)
  rm -f "$CFG"
  aws cloudfront tag-resource --resource "arn:aws:cloudfront::$ACCOUNT:distribution/$DIST" --tags "Items=[{$TAG}]"
fi
DOMAIN=$(aws cloudfront get-distribution --id "$DIST" --query Distribution.DomainName --output text)
# The addresses people use (the app checks form posts against them). Keeps any domain added later.
HOSTS=$(aws ssm get-parameter --name /kangaroo/public-hosts --query Parameter.Value --output text 2>/dev/null || true)
case ",$HOSTS," in *",$DOMAIN,"*) ;; *) HOSTS="${HOSTS:+$HOSTS,}$DOMAIN" ;; esac
aws ssm put-parameter --name /kangaroo/public-hosts --type String --value "$HOSTS" --overwrite >/dev/null

step "Done"
echo "Server:      $IID ($EIP, $HOST)"
echo "CloudFront:  $DIST"
echo "Web address: https://$DOMAIN"
echo "The server needs about 10 minutes to install and build the first time, and CloudFront a few minutes to spread."
