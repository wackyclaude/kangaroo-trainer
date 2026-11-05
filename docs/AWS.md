# Running Kangaroo Trainer on AWS

One small server in Stockholm, reached through CloudFront at an address like `https://d1a2b3c4.cloudfront.net`. A domain name can be added later without rebuilding anything.

## How it fits together

```
browser ──HTTPS──▶ CloudFront ──HTTPS + secret header──▶ Caddy ──▶ app (SQLite)
                   (AWS certificate)                     (Let's Encrypt for <ip>.sslip.io)
```

- **Server:** EC2 t4g.small, Ubuntu 24.04, 20 GB encrypted disk, fixed IP (Elastic IP). No SSH: use Session Manager.
- **Firewall:** port 443 only from CloudFront's addresses; port 80 open so Let's Encrypt can check the server. Caddy refuses any request without the secret header that only our CloudFront distribution sends.
- **Question bank:** private S3 bucket, copied to the server at every start. It is never in git.
- **Settings:** Parameter Store under `/kangaroo/` (the CloudFront secret is encrypted).
- **Backups:** the app makes one database backup a day. Every hour the server copies new ones to a versioned S3 bucket that it can add to but not read or delete. Every evening there's also a snapshot of the whole disk, and the last 7 are kept.
- **Night:** the server stops at 22:00 and starts at 07:00, Amsterdam time. While it's off, the address shows a CloudFront error page.
- **Cost:** about $20 a month (server, disk, fixed IP and snapshots). CloudFront is free at family use.

## First install

You need the apps-prod account, region **Europe (Stockholm)**, and the question bank as `kt-content.tar.gz` (made on the Mac from `bank/`: `questions.json`, `img/`, `olympiad/`).

1. Open **CloudShell** (the `>_` icon at the top of the AWS console) in apps-prod, Stockholm.
2. **Actions → Upload file**, and pick `kt-content.tar.gz`.
3. Run:
   ```sh
   curl -fsSLO https://raw.githubusercontent.com/wackyclaude/kangaroo-trainer/main/deploy/aws/setup.sh
   less setup.sh        # read it first (q to quit)
   bash setup.sh
   ```
4. Wait about 10 minutes, then open the web address the script printed.
5. Get the one-time setup code for the parent profile:
   ```sh
   ID=$(aws ec2 describe-instances --filters Name=tag:App,Values=kangaroo Name=instance-state-name,Values=running --query 'Reservations[0].Instances[0].InstanceId' --output text)
   CMD=$(aws ssm send-command --instance-ids "$ID" --document-name AWS-RunShellScript --parameters 'commands=["cd /srv/kt/app && docker compose logs app 2>&1 | grep FIRST-TIME"]' --query Command.CommandId --output text)
   sleep 5; aws ssm get-command-invocation --command-id "$CMD" --instance-id "$ID" --query StandardOutputContent --output text
   ```

## Everyday jobs

- **Update the app:** in Session Manager, run `cd /srv/kt/app && sudo git fetch -q origin && sudo git checkout -q origin/main && sudo systemctl restart kt` (it rebuilds, a few minutes).
- **New questions or explanations:** upload a new `kt-content.tar.gz` to CloudShell and run `bash setup.sh` again (it only changes what's different), then restart the server or run `sudo systemctl restart kt`.
- **Always on instead of off at night:** `NIGHT_OFF=no bash setup.sh`. Other hours: `STOP_AT=21 START_AT=6 bash setup.sh`.
- **Logs:** `cd /srv/kt/app && sudo docker compose logs --tail 100`.
- **First boot log:** `/var/log/kt-bootstrap.log`.

## Adding a domain later

1. Buy the domain in Route 53 (apps-prod).
2. Request a certificate for it in **Certificate Manager, region us-east-1** (CloudFront only uses certificates from there), with DNS validation.
3. Add the domain to the distribution (**Alternate domain names**) and choose the certificate.
4. In Route 53, add an **A/AAAA alias** record pointing to the distribution.

5. Add the domain to the app's list of addresses, then restart it: in CloudShell `aws ssm put-parameter --name /kangaroo/public-hosts --type String --overwrite --value "d….cloudfront.net,www.example.nl"`, and on the server `sudo systemctl restart kt`.

The server and its sslip.io name stay as they are.
