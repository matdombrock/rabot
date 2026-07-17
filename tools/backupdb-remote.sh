#! /bin/bash

name=./db-`date +%s`-rmt.bak

rsync -av --progress root@n0fa.de:~/rabot/db $name

echo database backed up to $name

