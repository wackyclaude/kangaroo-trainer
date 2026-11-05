# shellcheck shell=bash
# Shared by the server scripts: finds the AWS CLI (installed as a snap) and this server's region.
export PATH="$PATH:/snap/bin"
if [ -z "${AWS_REGION:-}" ]; then
  TOKEN=$(curl -fsS -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60')
  AWS_REGION=$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/placement/region)
  export AWS_REGION AWS_DEFAULT_REGION=$AWS_REGION
fi
