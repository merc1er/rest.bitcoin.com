/*
  Unit tests for the ninsight service library.
*/

const assert = require("chai").assert
const sinon = require("sinon")

const Ninsight = require("../../../src/routes/v3/services/ninsight")
let uut // Unit Under Test

const mockData = require("../mocks/ninsight-mock")

describe("#Ninsight", () => {
  let sandbox

  beforeEach(() => {
    uut = new Ninsight()

    sandbox = sinon.createSandbox()
  })

  afterEach(() => sandbox.restore())

  describe("#constructor", () => {
    it("should encapsulate dependencies", () => {
      assert.property(uut, "bitbox")
    })
  })

  describe("#balance", () => {
    it("should retrieve BCH balance and output should comply with spec", async () => {
      // console.log(`mockData: ${JSON.stringify(mockData, null, 2)}`)

      // Use mocks to prevent live network calls.
      sandbox.stub(uut.axios, "get").resolves({ data: mockData.balance })

      const addr = "bitcoincash:qp3sn6vlwz28ntmf3wmyra7jqttfx7z6zgtkygjhc7"

      const result = await uut.balance(addr)
      // console.log(`result: ${JSON.stringify(result, null, 2)}`)

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

    it("should handle thrown errors", async () => {
      try {
        // Force axios to throw an error
        sandbox.stub(uut.axios, "get").rejects(new Error("ENETUNREACH"))

        const addr = "bitcoincash:qp3sn6vlwz28ntmf3wmyra7jqttfx7z6zgtkygjhc7"

        await uut.balance(addr)

        assert.equal(true, false, "unexpected result")
      } catch (err) {
        assert.include(err.message, "ENETUNREACH")
      }
    })
  })
})
