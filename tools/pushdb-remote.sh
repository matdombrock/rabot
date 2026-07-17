#! /bin/bash

./tools/backupdb-remote.sh || exit 1

# ssh root@n0fa.de 'rm -rf ~/rabot/db'

rsync -av --progress ./db root@n0fa.de:~/rabot/

echo database pushed

