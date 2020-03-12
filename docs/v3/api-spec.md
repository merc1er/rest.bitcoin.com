# v3 API Specification
This document captures the specification for the new v3 routes.

## Address Balance
```
{
  "balance": <number>,
  "balanceSat": <number>,
  "totalReceived": <number>,
  "totalReceivedSat": <number>,
  "totalSent": <number>,
  "totalSentSat": <number>,
  "unconfirmedBalance": <number>,
  "unconfirmedBalanceSat": <number>,
  "unconfirmedTxAppearances": <number>,
  "txAppearances": <number>,
  "slpData": {
    "tokensBalance": [
      {
        "tokenId": <string>,
        "decimals": <number>
        "balance": <string>,
        "unconfirmedBalance": <string>,
        "imageUrl": <string>
      }
    ]
  }
  "transactions": [
    <txid>
  ],
  "address": <string>,
  "addressLegacy": <string>,
  "addressSlp": <string>
}
```

## Address UTXO
```
{
"address": <string>,
"utxos": [
      {
        "txid": <string>,
        "index": <number>,
        "satoshis": <number>,
        "height": <number>,
        "slpData": {
          "isSlp": <boolean>
        }
      },
      {
        "txid": <string>,
        "index": <number>,
        "satoshis": <number>,
        "height": <number>,
        "slpData": {
          "isSlp": <boolean>,
          "isValid": <boolean> | null,
          "tokenId": <string>,
          "decimals": <number>
          "tokenAmount": <string>,
  				"imageUrl": <string>
        }
      }
    ]
}
```
