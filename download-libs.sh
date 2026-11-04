#!/bin/sh
# Chạy 1 lần trong thư mục lib/:  sh download-libs.sh
set -e
curl -fL -o xlsx.full.min.js https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js
curl -fL -o exceljs.min.js   https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js
curl -fL -o zxing.min.js     https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js
ls -l *.js
