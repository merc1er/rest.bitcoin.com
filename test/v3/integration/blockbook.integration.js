/*
  Integration tests for the Blockbook service library that interfaces with the
  Blockbook Indexer REST API.
*/

const assert = require("chai").assert

const Blockbook = require("../../../src/routes/v3/services/blockbook")
let uut // Unit Under Test

describe("#Blockbook", () => {
  beforeEach(() => {
    uut = new Blockbook()
  })

  describe("#balance", () => {
    it("should retrieve BCH balance and output should comply with spec", async () => {
      const addr = "bitcoincash:qp3sn6vlwz28ntmf3wmyra7jqttfx7z6zgtkygjhc7"

      const result = await uut.balance(addr)
      console.log(`result: ${JSON.stringify(result, null, 2)}`)

      // Ensure the returned value meets the specificiations in /docs/v3/api-spec.md
      assert.property(result, "balance")
      assert.isNumber(result.balance)
      assert.property(result, "balanceSat")
      assert.isNumber(result.balanceSat)
      assert.property(result, "totalReceived")
      assert.isNumber(result.totalReceived)
      assert.property(result, "totalReceivedSat")
      assert.isNumber(result.totalReceivedSat)
      assert.property(result, "totalSent")
      assert.isNumber(result.totalSent)
      assert.property(result, "totalSentSat")
      assert.isNumber(result.totalSentSat)
      assert.property(result, "unconfirmedBalance")
      assert.isNumber(result.unconfirmedBalance)
      assert.property(result, "unconfirmedBalanceSat")
      assert.isNumber(result.unconfirmedBalanceSat)
      assert.property(result, "unconfirmedTxApperances")
      assert.isNumber(result.unconfirmedTxApperances)
      assert.property(result, "txApperances")
      assert.isNumber(result.txApperances)
      assert.property(result, "slpData")
      assert.property(result, "transactions")
      assert.isArray(result.transactions)
      assert.property(result, "address")
      assert.isString(result.address)
      assert.property(result, "addressLegacy")
      assert.isString(result.addressLegacy)
      assert.property(result, "addressSlp")
      assert.isString(result.addressSlp)
    })
  })
})
