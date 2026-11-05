#!/usr/bin/env bash
# First boot of the Kangaroo Trainer server (Ubuntu 24.04, arm64). Run as root by the
# instance's user data, from a clone of the repo in /srv/kt/app. Safe to run again.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
APP=/srv/kt/app

# 2 GB swap: building the images on a 2 GB server needs a little room.
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
swapon -a

# Docker from Docker's own signed apt repository (with the compose and buildx plugins).
apt-get update -q
apt-get install -y -q ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -q
apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

# AWS CLI, to read the settings and sync content and backups.
command -v aws >/dev/null || [ -x /snap/bin/aws ] || snap install aws-cli --classic

# Security updates install themselves (Ubuntu's unattended-upgrades is on by default); check it is.
apt-get install -y -q unattended-upgrades
systemctl enable --now unattended-upgrades

# Folders. The app runs as user 1000 inside its container.
mkdir -p /srv/kt/data /srv/kt/backups /srv/kt/content
chown 1000:1000 /srv/kt/data /srv/kt/backups
chmod 700 /srv/kt/data /srv/kt/backups

rm -f /usr/local/sbin/kt-start /usr/local/sbin/kt-backup   # older installs copied the scripts here
install -m 0644 "$APP/deploy/aws/kt.service" "$APP/deploy/aws/kt-backup.service" "$APP/deploy/aws/kt-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable kt.service kt-backup.timer
systemctl start kt-backup.timer
systemctl restart kt.service
echo "bootstrap done"
