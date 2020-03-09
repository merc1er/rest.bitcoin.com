/*
  Mocking data for Ninsight unit tests.
*/

const balance = {
  addrStr: "bitcoincash:qp3sn6vlwz28ntmf3wmyra7jqttfx7z6zgtkygjhc7",
  balance: 0.00001,
  balanceSat: 1000,
  totalReceived: 0.00001,
  totalReceivedSat: 1000,
  totalSent: 0,
  totalSentSat: 0,
  unconfirmedBalance: 0,
  unconfirmedBalanceSat: 0,
  unconfirmedTxApperances: 0,
  txApperances: 1,
  transactions: [
    "6181c669614fa18039a19b23eb06806bfece1f7514ab457c3bb82a40fe171a6d"
  ]
}

module.exports = {
  balance
}
