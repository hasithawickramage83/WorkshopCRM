#!/bin/bash
set -e
TOKEN=$(curl -sf -X POST http://127.0.0.1:5020/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@ceylonautomobile.co.nz","password":"Admin@123"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["accessToken"])')
curl -sf -X POST http://127.0.0.1:5020/api/finance/collections/backfill-from-invoices \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json'
echo
