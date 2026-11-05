#!/usr/bin/env bash
# Copies the app's daily database backups to S3. The server may add files but can't delete or
# read anything there, so a broken or hacked server can't wipe the backups.
set -euo pipefail
. /srv/kt/app/deploy/aws/env.sh
BUCKET=$(aws ssm get-parameter --name /kangaroo/backup-bucket --query Parameter.Value --output text)
aws s3 sync /srv/kt/backups/ "s3://$BUCKET/backups/" --only-show-errors --size-only
