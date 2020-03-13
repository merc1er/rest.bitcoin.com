// imports
import axios, { AxiosResponse } from "axios"
import * as express from "express"
import * as util from "util"
import BigNumber from "bignumber.js"

import {
  BalanceForAddressByTokenId,
  BalancesForAddress,
  BalancesForToken,
  BurnTotalResult,
  ConvertResult,
  TokenInterface,
  ValidateTxidResult,
  TransactionInterface
} from "./interfaces/RESTInterfaces"

import logger = require("./logging.js")
import routeUtils = require("./route-utils")
import wlogger = require("../../util/winston-logging")

import { BITBOX } from "bitbox-sdk"

// Services
import { SlpIndexer } from './services/slpIndexer'
import { Slpdb } from "./services/slpdb"
import { ISlpData } from "./interfaces/ISlpData";

const transactions = require("./transaction")

// consts
const bitbox: BITBOX = new BITBOX()
const router: any = express.Router()
const SLPSDK: any = require("slp-sdk")
const SLP: any = new SLPSDK()
const slp: any = SLP.slpjs
const utils: any = slp.Utils

const slpDataService: ISlpData = process.env.SLP_INDEXER_URL ? new SlpIndexer() : new Slpdb()

// Used to convert error messages to strings, to safely pass to users.
util.inspect.defaultOptions = { depth: 5 }

// Setup REST and TREST URLs used by slpjs
// Dev note: this allows for unit tests to mock the URL.
if (!process.env.REST_URL) process.env.REST_URL = `https://rest.bitcoin.com/v2/`
if (!process.env.TREST_URL)
  process.env.TREST_URL = `https://trest.bitcoin.com/v2/`

router.get("/", root)
router.get("/list", list)
router.get("/list/:tokenId", listSingleToken)
router.post("/list", listBulkToken)
router.get("/balancesForAddress/:address", balancesForAddressSingle)
router.post("/balancesForAddress", balancesForAddressBulk)
router.get("/balancesForToken/:tokenId", balancesForTokenSingle)
router.post("/balancesForToken", balancesForTokenBulk)
router.get("/balance/:address/:tokenId", balancesForAddressByTokenIDSingle)
router.post("/balance", balancesForAddressByTokenIDBulk)
router.get("/convert/:address", convertAddressSingle)
router.post("/convert", convertAddressBulk)
router.post("/validateTxid", validateBulk)
router.get("/validateTxid/:txid", validateSingle)
router.get("/txDetails/:txid", txDetails)
router.get("/tokenStats/:tokenId", tokenStatsSingle)
router.post("/tokenStats", tokenStatsBulk)
router.get("/transactionHistoryAllTokens/:address", txsByAddressSingle)
router.post("/transactionHistoryAllTokens", txsByAddressBulk)
router.get("/transactions/:tokenId/:address", txsTokenIdAddressSingle)
router.post("/transactions", txsTokenIdAddressBulk)
router.get("/burnTotal/:transactionId", burnTotalSingle)
router.post("/burnTotal", burnTotalBulk)

if (process.env.NON_JS_FRAMEWORK && process.env.NON_JS_FRAMEWORK === "true") {
  router.get(
    "/createTokenType1/:fundingAddress/:fundingWif/:tokenReceiverAddress/:batonReceiverAddress/:bchChangeReceiverAddress/:decimals/:name/:symbol/:documentUri/:documentHash/:initialTokenQty",
    createTokenType1
  )
  router.get(
    "/mintTokenType1/:fundingAddress/:fundingWif/:tokenReceiverAddress/:batonReceiverAddress/:bchChangeReceiverAddress/:tokenId/:additionalTokenQty",
    mintTokenType1
  )
  router.get(
    "/sendTokenType1/:fundingAddress/:fundingWif/:tokenReceiverAddress/:bchChangeReceiverAddress/:tokenId/:amount",
    sendTokenType1
  )
  router.get(
    "/burnTokenType1/:fundingAddress/:fundingWif/:bchChangeReceiverAddress/:tokenId/:amount",
    burnTokenType1
  )
}

function root(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): express.Response {
  return res.json({ status: "slp" })
}

async function list(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<express.Response> {
  try {
    const result = await slpDataService.listAllTokens()

    res.status(200)
    return res.json(result)
  } catch (err) {
    wlogger.error(`Error in slp.ts/list().`, err)

    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }
    res.status(500)
    return res.json({ error: `Error in /list: ${err.message}` })
  }
}

async function listSingleToken(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<express.Response> {
  try {
    const tokenId: string = req.params.tokenId

    // Reject if tokenIds is not an array.
    if (!tokenId || tokenId === "") {
      res.status(400)
      return res.json({
        error: "tokenId can not be empty"
      })
    }

    const result = await slpDataService.listSingleToken(tokenId)

    res.status(200)
    return res.json(result)
  } catch (err) {
    wlogger.error(`Error in slp.ts/listSingleToken().`, err)

    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }
    res.status(500)
    return res.json({ error: `Error in /list/:tokenId: ${err.message}` })
  }
}

async function listBulkToken(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<express.Response> {
  try {
    const tokenIds: string[] = req.body.tokenIds

    // Reject if tokenIds is not an array.
    if (!Array.isArray(tokenIds)) {
      res.status(400)
      return res.json({
        error: "tokenIds needs to be an array. Use GET for single tokenId."
      })
    }

    // Enforce array size rate limits
    if (!routeUtils.validateArraySize(req, tokenIds)) {
      res.status(429) // https://github.com/Bitcoin-com/rest.bitcoin.com/issues/330
      return res.json({
        error: `Array too large.`
      })
    }

    const result = await slpDataService.listBulkToken(tokenIds)

    res.status(200)
    return res.json(result)
  } catch (err) {
    wlogger.error(`Error in slp.ts/listBulkToken().`, err)

    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }
    res.status(500)
    return res.json({ error: `Error in /list/:tokenId: ${err.message}` })
  }
}

// Retrieve token balances for all tokens for a single address.
async function balancesForAddressSingle(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<express.Response> {
  try {
    // Validate the input data.
    const address: string = req.params.address
    if (!address || address === "") {
      res.status(400)
      return res.json({ error: "address can not be empty" })
    }

    // Ensure the input is a valid BCH address.
    try {
      utils.toCashAddress(address)
    } catch (err) {
      res.status(400)
      return res.json({
        error: `Invalid BCH address. Double check your address is valid: ${address}`
      })
    }

    // Prevent a common user error. Ensure they are using the correct network address.
    const cashAddr: string = utils.toCashAddress(address)
    const networkIsValid: boolean = routeUtils.validateNetwork(cashAddr)
    if (!networkIsValid) {
      res.status(400)
      return res.json({
        error: `Invalid network. Trying to use a testnet address on mainnet, or vice versa.`
      })
    }

    const result = await slpDataService.getBalancesForAddressSingle(address)

    res.status(200)
    return res.json(result)

  } catch (err) {
    wlogger.error(`Error in slp.ts/balancesForAddress().`, err)

    // Decode the error message.
    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }

    res.status(500)
    return res.json({
      error: `Error in /balancesForAddress/:address: ${err.message}`
    })
  }
}

// Retrieve token balances for all tokens for a single address.
async function balancesForAddressBulk(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<express.Response> {
  try {
    const addresses: string[] = req.body.addresses

    // Reject if addresses is not an array.
    if (!Array.isArray(addresses)) {
      res.status(400)
      return res.json({ error: "addresses needs to be an array" })
    }

    // Enforce array size rate limits
    if (!routeUtils.validateArraySize(req, addresses)) {
      res.status(429) // https://github.com/Bitcoin-com/rest.bitcoin.com/issues/330
      return res.json({
        error: `Array too large.`
      })
    }

    logger.debug(
      `Executing slp/balancesForAddresss with these addresses: `,
      addresses
    )

    addresses.forEach((address: string) => {
      // Validate the input data.
      if (!address || address === "") {
        res.status(400)
        return res.json({ error: "address can not be empty" })
      }

      // Ensure the input is a valid BCH address.
      try {
        utils.toCashAddress(address)
      } catch (err) {
        res.status(400)
        return res.json({
          error: `Invalid BCH address. Double check your address is valid: ${address}`
        })
      }

      // Prevent a common user error. Ensure they are using the correct network address.
      const cashAddr: string = utils.toCashAddress(address)
      const networkIsValid: boolean = routeUtils.validateNetwork(cashAddr)
      if (!networkIsValid) {
        res.status(400)
        return res.json({
          error: `Invalid network. Trying to use a testnet address on mainnet, or vice versa.`
        })
      }
    })

    const balancesPromises: Promise<any>[] = addresses.map(
      async (address: string) => {
        try {
          const addressResult = await slpDataService.getBalancesForAddressSingle(address)
          return addressResult
        } catch (err) {
          throw err
        }
      }
    )
    const axiosResult: any[] = await Promise.all(balancesPromises)
    return res.json(axiosResult)
  } catch (err) {
    wlogger.error(`Error in slp.ts/balancesForAddress().`, err)

    // Decode the error message.
    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }

    res.status(500)
    return res.json({
      error: `Error in /balancesForAddress/:address: ${err.message}`
    })
  }
}

// Retrieve token balances for all addresses by single tokenId.
async function balancesForTokenSingle(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<express.Response> {
  try {
    // Validate the input data.
    const tokenId: string = req.params.tokenId
    if (!tokenId || tokenId === "") {
      res.status(400)
      return res.json({ error: "tokenId can not be empty" })
    }

    const result = await slpDataService.getBalancesForTokenSingle(tokenId)
    return res.json(result)
  } catch (err) {
    wlogger.error(`Error in slp.ts/balancesForTokenSingle().`, err)

    // Decode the error message.
    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }

    res.status(500)
    return res.json({
      error: `Error in /balancesForToken/:tokenId: ${err.message}`
    })
  }
}

async function balancesForTokenBulk(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<express.Response> {
  try {
    const tokenIds: string[] = req.body.tokenIds

    // Reject if hashes is not an array.
    if (!Array.isArray(tokenIds)) {
      res.status(400)
      return res.json({
        error: "tokenIds needs to be an array. Use GET for single tokenId."
      })
    }

    // Enforce array size rate limits
    if (!routeUtils.validateArraySize(req, tokenIds)) {
      res.status(429) // https://github.com/Bitcoin-com/rest.bitcoin.com/issues/330
      return res.json({
        error: `Array too large.`
      })
    }

    tokenIds.forEach((tokenId: string) => {
      // Validate the input data.
      if (!tokenId || tokenId === "") {
        res.status(400)
        return res.json({ error: "tokenId can not be empty" })
      }
    })

    const tokenIdPromises: Promise<any>[] = tokenIds.map(
      async (tokenId: string) => {
        try {
          const balanceResult = await slpDataService.getBalancesForTokenSingle(tokenId)
          return balanceResult
        } catch (err) {
          throw err
        }
      }
    )
    const axiosResult: any[] = await Promise.all(tokenIdPromises)
    res.status(200)
    return res.json(axiosResult)
  } catch (err) {
    wlogger.error(`Error in slp.ts/balancesForTokenSingle().`, err)

    // Decode the error message.
    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }

    res.status(500)
    return res.json({
      error: `Error in /balancesForToken/:tokenId: ${err.message}`
    })
  }
}

// Retrieve token balances for a single token class, for a single address.
async function balancesForAddressByTokenIDSingle(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<express.Response> {
  try {
    // Validate input data.
    const address: string = req.params.address
    if (!address || address === "") {
      res.status(400)
      return res.json({ error: "address can not be empty" })
    }

    const tokenId: string = req.params.tokenId
    if (!tokenId || tokenId === "") {
      res.status(400)
      return res.json({ error: "tokenId can not be empty" })
    }

    // Ensure the input is a valid BCH address.
    try {
      utils.toCashAddress(address)
    } catch (err) {
      res.status(400)
      return res.json({
        error: `Invalid BCH address. Double check your address is valid: ${address}`
      })
    }

    // Prevent a common user error. Ensure they are using the correct network address.
    const cashAddr: string = utils.toCashAddress(address)
    const networkIsValid: boolean = routeUtils.validateNetwork(cashAddr)
    if (!networkIsValid) {
      res.status(400)
      return res.json({
        error: `Invalid network. Trying to use a testnet address on mainnet, or vice versa.`
      })
    }

    const result = slpDataService.getBalancesForAddressByTokenIdSingle(address, tokenId)

    res.status(200)
    return res.json(result)
  } catch (err) {
    wlogger.error(`Error in slp.ts/balancesForAddressByTokenID().`, err)

    // Decode the error message.
    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }

    res.status(500)
    return res.json({
      error: `Error in /balance/:address/:tokenId: ${err.message}`
    })
  }
}

async function balancesForAddressByTokenIDBulk(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<express.Response> {
  try {
    req.body.forEach((r: any) => {
      // Validate input data.
      if (!r.address || r.address === "") {
        res.status(400)
        return res.json({ error: "address can not be empty" })
      }

      if (!r.tokenId || r.tokenId === "") {
        res.status(400)
        return res.json({ error: "tokenId can not be empty" })
      }

      // Ensure the input is a valid BCH address.
      try {
        utils.toCashAddress(r.address)
      } catch (err) {
        res.status(400)
        return res.json({
          error: `Invalid BCH address. Double check your address is valid: ${r.address}`
        })
      }

      // Prevent a common user error. Ensure they are using the correct network address.
      const cashAddr: string = utils.toCashAddress(r.address)
      const networkIsValid: boolean = routeUtils.validateNetwork(cashAddr)
      if (!networkIsValid) {
        res.status(400)
        return res.json({
          error: `Invalid network. Trying to use a testnet address on mainnet, or vice versa.`
        })
      }
    })
    const tokenIdPromises: Promise<any>[] = req.body.map(async (data: any) => {
      try {
        const balanceResult = await slpDataService.getBalancesForAddressByTokenIdSingle(data.address, data.tokenId)
        return balanceResult
      } catch (err) {
        throw err
      }
    })
    const axiosResult: any[] = await Promise.all(tokenIdPromises)
    res.status(200)
    return res.json(axiosResult)
  } catch (err) {
    wlogger.error(`Error in slp.ts/balancesForAddressByTokenID().`, err)

    // Decode the error message.
    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }

    res.status(500)
    return res.json({
      error: `Error in /balance/:address/:tokenId: ${err.message}`
    })
  }
}

async function convertAddressSingle(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<express.Response> {
  try {
    const address: string = req.params.address

    // Validate input
    if (!address || address === "") {
      res.status(400)
      return res.json({ error: "address can not be empty" })
    }

    const slpAddr: string = SLP.Address.toSLPAddress(address)

    const obj: ConvertResult = {
      slpAddress: "",
      cashAddress: "",
      legacyAddress: ""
    }
    obj.slpAddress = slpAddr
    obj.cashAddress = SLP.Address.toCashAddress(slpAddr)
    obj.legacyAddress = SLP.Address.toLegacyAddress(obj.cashAddress)

    res.status(200)
    return res.json(obj)
  } catch (err) {
    wlogger.error(`Error in slp.ts/convertAddressSingle().`, err)

    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }
    res.status(500)
    return res.json({
      error: `Error in /address/convert/:address: ${err.message}`
    })
  }
}

async function convertAddressBulk(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<express.Response> {
  const addresses: string[] = req.body.addresses

  // Reject if hashes is not an array.
  if (!Array.isArray(addresses)) {
    res.status(400)
    return res.json({
      error: "addresses needs to be an array. Use GET for single address."
    })
  }

  // Enforce array size rate limits
  if (!routeUtils.validateArraySize(req, addresses)) {
    res.status(429) // https://github.com/Bitcoin-com/rest.bitcoin.com/issues/330
    return res.json({
      error: `Array too large.`
    })
  }

  // Convert each address in the array.
  const convertedAddresses: ConvertResult[] = []
  for (let i: number = 0; i < addresses.length; i++) {
    const address = addresses[i]

    // Validate input
    if (!address || address === "") {
      res.status(400)
      return res.json({ error: "address can not be empty" })
    }

    const slpAddr: string = SLP.Address.toSLPAddress(address)

    const obj: ConvertResult = {
      slpAddress: "",
      cashAddress: "",
      legacyAddress: ""
    }
    obj.slpAddress = slpAddr
    obj.cashAddress = SLP.Address.toCashAddress(slpAddr)
    obj.legacyAddress = SLP.Address.toLegacyAddress(obj.cashAddress)

    convertedAddresses.push(obj)
  }

  res.status(200)
  return res.json(convertedAddresses)
}

async function validateSingle(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<express.Response> {
  try {
    const txid: string = req.params.txid

    // Validate input
    if (!txid || txid === "") {
      res.status(400)
      return res.json({ error: "txid can not be empty" })
    }

    logger.debug(`Executing slp/validate/:txid with this txid: `, txid)

    const result = await slpDataService.validateTxid(txid)

    res.status(200)
    return res.json(result)
  } catch (err) {
    wlogger.error(`Error in slp.ts/validateSingle().`, err)

    // Attempt to decode the error message.
    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }

    res.status(500)
    return res.json({ error: util.inspect(err) })
  }
}

async function validateBulk(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<express.Response> {
  try {
    const txids: string[] = req.body.txids

    // Reject if txids is not an array.
    if (!Array.isArray(txids)) {
      res.status(400)
      return res.json({ error: "txids needs to be an array" })
    }

    // Enforce array size rate limits
    if (!routeUtils.validateArraySize(req, txids)) {
      res.status(429) // https://github.com/Bitcoin-com/rest.bitcoin.com/issues/330
      return res.json({
        error: `Array too large.`
      })
    }

    logger.debug(`Executing slp/validate with these txids: `, txids)

    const result = await slpDataService.validateTxidArray(txids)

    res.status(200)
    return res.json(result)
  } catch (err) {
    wlogger.error(`Error in slp.ts/validateBulk().`, err)

    // Attempt to decode the error message.
    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }

    res.status(500)
    return res.json({ error: util.inspect(err) })
  }
}

// Returns a Boolean if the input TXID is a valid SLP TXID.
// async function isValidSlpTxid(txid: string): Promise<boolean> {
//   const isValid: Promise<boolean> = await slpValidator.isValidSlpTxid(txid)
//   return isValid
// }

async function burnTotalSingle(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<express.Response> {
  try {
    const txid: string = req.params.transactionId

    const result = slpDataService.getTransactionBurnTotal(txid)

    res.status(200)
    return res.json(result)
  } catch (err) {
    wlogger.error(`Error in slp.ts/burnTotalSingle().`, err)

    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }
    res.status(500)
    return res.json({ error: `Error in /burnTotal: ${err.message}` })
  }
}

async function burnTotalBulk(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<express.Response> {
  try {
    const txids: string[] = req.body.txids

    // Reject if txids is not an array.
    if (!Array.isArray(txids)) {
      res.status(400)
      return res.json({ error: "txids needs to be an array" })
    }

    // Enforce array size rate limits
    if (!routeUtils.validateArraySize(req, txids)) {
      res.status(429) // https://github.com/Bitcoin-com/rest.bitcoin.com/issues/330
      return res.json({
        error: `Array too large.`
      })
    }

    logger.debug(`Executing slp/burnTotal with these txids: `, txids)

    const txidPromises = txids.map(async (txid: string) => {
      const burnResult = await slpDataService.getTransactionBurnTotal(txid)
      return burnResult
    })
    const axiosResult = await Promise.all(txidPromises)

    res.status(200)
    return res.json(axiosResult)
  } catch (err) {
    wlogger.error(`Error in slp.ts/burnTotalSingle().`, err)

    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }
    res.status(500)
    return res.json({ error: `Error in /burnTotal: ${err.message}` })
  }
}

// Below are functions which are enabled for teams not using our javascript SDKs which still need to create txs
// These should never be enabled on our public REST API

async function createTokenType1(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<express.Response> {
  const fundingAddress: string = req.params.fundingAddress
  if (!fundingAddress || fundingAddress === "") {
    res.status(400)
    return res.json({ error: "fundingAddress can not be empty" })
  }

  const fundingWif: string = req.params.fundingWif
  if (!fundingWif || fundingWif === "") {
    res.status(400)
    return res.json({ error: "fundingWif can not be empty" })
  }

  const tokenReceiverAddress: string = req.params.tokenReceiverAddress
  if (!tokenReceiverAddress || tokenReceiverAddress === "") {
    res.status(400)
    return res.json({ error: "tokenReceiverAddress can not be empty" })
  }

  const batonReceiverAddress: string = req.params.batonReceiverAddress
  if (!batonReceiverAddress || batonReceiverAddress === "") {
    res.status(400)
    return res.json({ error: "batonReceiverAddress can not be empty" })
  }

  const bchChangeReceiverAddress: string = req.params.bchChangeReceiverAddress
  if (!bchChangeReceiverAddress || bchChangeReceiverAddress === "") {
    res.status(400)
    return res.json({ error: "bchChangeReceiverAddress can not be empty" })
  }

  const decimals: string = req.params.decimals
  if (!decimals || decimals === "") {
    res.status(400)
    return res.json({ error: "decimals can not be empty" })
  }

  const name: string = req.params.name
  if (!name || name === "") {
    res.status(400)
    return res.json({ error: "name can not be empty" })
  }

  const symbol: string = req.params.symbol
  if (!symbol || symbol === "") {
    res.status(400)
    return res.json({ error: "symbol can not be empty" })
  }

  const documentUri: string = req.params.documentUri
  if (!documentUri || documentUri === "") {
    res.status(400)
    return res.json({ error: "documentUri can not be empty" })
  }

  const documentHash: string = req.params.documentHash
  if (!documentHash || documentHash === "") {
    res.status(400)
    return res.json({ error: "documentHash can not be empty" })
  }

  const initialTokenQty: string = req.params.initialTokenQty
  if (!initialTokenQty || initialTokenQty === "") {
    res.status(400)
    return res.json({ error: "initialTokenQty can not be empty" })
  }

  const token: Promise<any> = await SLP.TokenType1.create({
    fundingAddress: fundingAddress,
    fundingWif: fundingWif,
    tokenReceiverAddress: tokenReceiverAddress,
    batonReceiverAddress: batonReceiverAddress,
    bchChangeReceiverAddress: bchChangeReceiverAddress,
    decimals: decimals,
    name: name,
    symbol: symbol,
    documentUri: documentUri,
    documentHash: documentHash,
    initialTokenQty: initialTokenQty
  })

  res.status(200)
  return res.json(token)
}

async function mintTokenType1(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<express.Response> {
  const fundingAddress: string = req.params.fundingAddress
  if (!fundingAddress || fundingAddress === "") {
    res.status(400)
    return res.json({ error: "fundingAddress can not be empty" })
  }

  const fundingWif: string = req.params.fundingWif
  if (!fundingWif || fundingWif === "") {
    res.status(400)
    return res.json({ error: "fundingWif can not be empty" })
  }

  const tokenReceiverAddress: string = req.params.tokenReceiverAddress
  if (!tokenReceiverAddress || tokenReceiverAddress === "") {
    res.status(400)
    return res.json({ error: "tokenReceiverAddress can not be empty" })
  }

  const batonReceiverAddress: string = req.params.batonReceiverAddress
  if (!batonReceiverAddress || batonReceiverAddress === "") {
    res.status(400)
    return res.json({ error: "batonReceiverAddress can not be empty" })
  }

  const bchChangeReceiverAddress: string = req.params.bchChangeReceiverAddress
  if (!bchChangeReceiverAddress || bchChangeReceiverAddress === "") {
    res.status(400)
    return res.json({ error: "bchChangeReceiverAddress can not be empty" })
  }

  const tokenId: string = req.params.tokenId
  if (!tokenId || tokenId === "") {
    res.status(400)
    return res.json({ error: "tokenId can not be empty" })
  }

  const additionalTokenQty: string = req.params.additionalTokenQty
  if (!additionalTokenQty || additionalTokenQty === "") {
    res.status(400)
    return res.json({ error: "additionalTokenQty can not be empty" })
  }

  const mint: Promise<any> = await SLP.TokenType1.mint({
    fundingAddress: fundingAddress,
    fundingWif: fundingWif,
    tokenReceiverAddress: tokenReceiverAddress,
    batonReceiverAddress: batonReceiverAddress,
    bchChangeReceiverAddress: bchChangeReceiverAddress,
    tokenId: tokenId,
    additionalTokenQty: additionalTokenQty
  })

  res.status(200)
  return res.json(mint)
}

async function sendTokenType1(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<express.Response> {
  const fundingAddress: string = req.params.fundingAddress
  if (!fundingAddress || fundingAddress === "") {
    res.status(400)
    return res.json({ error: "fundingAddress can not be empty" })
  }

  const fundingWif: string = req.params.fundingWif
  if (!fundingWif || fundingWif === "") {
    res.status(400)
    return res.json({ error: "fundingWif can not be empty" })
  }

  const tokenReceiverAddress: string = req.params.tokenReceiverAddress
  if (!tokenReceiverAddress || tokenReceiverAddress === "") {
    res.status(400)
    return res.json({ error: "tokenReceiverAddress can not be empty" })
  }

  const bchChangeReceiverAddress: string = req.params.bchChangeReceiverAddress
  if (!bchChangeReceiverAddress || bchChangeReceiverAddress === "") {
    res.status(400)
    return res.json({ error: "bchChangeReceiverAddress can not be empty" })
  }

  const tokenId: string = req.params.tokenId
  if (!tokenId || tokenId === "") {
    res.status(400)
    return res.json({ error: "tokenId can not be empty" })
  }

  const amount: string = req.params.amount
  if (!amount || amount === "") {
    res.status(400)
    return res.json({ error: "amount can not be empty" })
  }
  const send: Promise<any> = await SLP.TokenType1.send({
    fundingAddress: fundingAddress,
    fundingWif: fundingWif,
    tokenReceiverAddress: tokenReceiverAddress,
    bchChangeReceiverAddress: bchChangeReceiverAddress,
    tokenId: tokenId,
    amount: amount
  })

  res.status(200)
  return res.json(send)
}

async function burnTokenType1(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<express.Response> {
  const fundingAddress: string = req.params.fundingAddress
  if (!fundingAddress || fundingAddress === "") {
    res.status(400)
    return res.json({ error: "fundingAddress can not be empty" })
  }

  const fundingWif: string = req.params.fundingWif
  if (!fundingWif || fundingWif === "") {
    res.status(400)
    return res.json({ error: "fundingWif can not be empty" })
  }

  const bchChangeReceiverAddress: string = req.params.bchChangeReceiverAddress
  if (!bchChangeReceiverAddress || bchChangeReceiverAddress === "") {
    res.status(400)
    return res.json({ error: "bchChangeReceiverAddress can not be empty" })
  }

  const tokenId: string = req.params.tokenId
  if (!tokenId || tokenId === "") {
    res.status(400)
    return res.json({ error: "tokenId can not be empty" })
  }

  const amount: string = req.params.amount
  if (!amount || amount === "") {
    res.status(400)
    return res.json({ error: "amount can not be empty" })
  }

  const burn: Promise<any> = await SLP.TokenType1.burn({
    fundingAddress: fundingAddress,
    fundingWif: fundingWif,
    tokenId: tokenId,
    amount: amount,
    bchChangeReceiverAddress: bchChangeReceiverAddress
  })

  res.status(200)
  return res.json(burn)
}

async function txDetails(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<express.Response> {
  try {
    // Validate input parameter
    const txid: string = req.params.txid
    if (!txid || txid === "") {
      res.status(400)
      return res.json({ error: "txid can not be empty" })
    }

    if (txid.length !== 64) {
      res.status(400)
      return res.json({ error: "This is not a txid" })
    }


    const tokenRes = await slpDataService.getTransactionDetails(txid)
    // console.log(`tokenRes: ${util.inspect(tokenRes)}`)

    // Format the returned data to an object.
    const formatted = await formatToRestObject(tokenRes)
    // console.log(`formatted: ${JSON.stringify(formatted,null,2)}`)

    // Return error if formatted token information is empty.
    if (!formatted) {
      res.status(404)
      return res.json({ error: "SLP transaction not found" })
    }

    // Get information on the transaction from Insight API.
    const retData: Promise<any> = await transactions.transactionsFromInsight(
      txid
    )
    // console.log(`retData: ${JSON.stringify(retData,null,2)}`)

    // Return both the tx data from Insight and the formatted token information.
    const response = {
      retData,
      ...formatted
    }

    res.status(200)
    return res.json(response)
  } catch (err) {
    wlogger.error(`Error in slp.ts/txDetails().`, err)

    // Attempt to decode the error message.
    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }

    // // Handle corner case of mis-typted txid
    // if (err.error.indexOf("Not found") > -1) {
    //   res.status(400)
    //   return res.json({ error: "TXID not found" })
    // }

    res.status(500)
    return res.json({ error: util.inspect(err) })
  }
}

// Format the response from SLPDB into an object.
async function formatToRestObject(slpDBFormat: any) {
  try {
    BigNumber.set({ DECIMAL_PLACES: 8 })

    // Get the data from the unconfirmed or confirmed collection.
    const transaction: any = slpDBFormat.data.u.length
      ? slpDBFormat.data.u[0]
      : slpDBFormat.data.c[0]

    const inputs: Array<any> = transaction.in

    const outputs: Array<any> = transaction.out
    const tokenOutputs: Array<any> = transaction.slp.detail.outputs

    const sendOutputs: Array<string> = ["0"]
    tokenOutputs.map(x => {
      const string = parseFloat(x.amount) * 100000000
      sendOutputs.push(string.toString())
    })

    const obj = {
      tokenInfo: {
        versionType: transaction.slp.detail.versionType,
        transactionType: transaction.slp.detail.transactionType,
        tokenIdHex: transaction.slp.detail.tokenIdHex,
        sendOutputs: sendOutputs
      },
      tokenIsValid: transaction.slp.valid
    }

    return obj
  } catch (err) {
    wlogger.error(`Error in slp.ts/formatToRestObject().`, err)

    return false
  }
}

// This function is a simple wrapper to make unit tests possible.
// It expects an instance of the slpjs BitboxNetwork class as input.
// Wrapping this in a function allows it to be stubbed so that the txDetails
// route can be tested as a unit test.
async function getSlpjsTxDetails(slpjsBitboxNetworkInstance, txid) {
  const result: Promise<
    any
  > = await slpjsBitboxNetworkInstance.getTransactionDetails(txid)

  return result
}

async function tokenStatsSingle(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<express.Response> {
  const tokenId: string = req.params.tokenId
  if (!tokenId || tokenId === "") {
    res.status(400)
    return res.json({ error: "tokenId can not be empty" })
  }

  try {
    const tokenStats = await slpDataService.getTokenStats(tokenId)

    res.status(200)
    return res.json(tokenStats)
  } catch (err) {
    wlogger.error(`Error in slp.ts/tokenStats().`, err)

    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }
    res.status(500)
    return res.json({ error: `Error in /tokenStats: ${err.message}` })
  }
}

async function tokenStatsBulk(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<express.Response> {
  const tokenIds: string[] = req.body.tokenIds

  // Reject if hashes is not an array.
  if (!Array.isArray(tokenIds)) {
    res.status(400)
    return res.json({
      error: "tokenIds needs to be an array. Use GET for single tokenId."
    })
  }

  // Enforce array size rate limits
  if (!routeUtils.validateArraySize(req, tokenIds)) {
    res.status(429) // https://github.com/Bitcoin-com/rest.bitcoin.com/issues/330
    return res.json({
      error: `Array too large.`
    })
  }

  logger.debug(`Executing slp/tokenStats with these tokenIds: `, tokenIds)

  // Validate each txid
  const statsPromises: Promise<any>[] = tokenIds.map(
    async (tokenId: string) => {
      try {
        const tokenStats = await slpDataService.getTokenStats(tokenId)

        return tokenStats
      } catch (err) {
        throw err
      }
    }
  )

  // Filter array to only valid txid results
  const statsResults: ValidateTxidResult[] = await Promise.all(statsPromises)
  const validTxids: any[] = statsResults.filter(result => result)

  res.status(200)
  return res.json(validTxids)
}

// Retrieve transactions by address.
async function txsByAddressSingle(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<express.Response> {
  try {
    // Validate the input data.
    const address: string = req.params.address
    if (!address || address === "") {
      res.status(400)
      return res.json({ error: "address can not be empty" })
    }

    const fromBlock: number = req.query.fromBlock
      ? parseInt(req.query.fromBlock, 10)
      : 0

    // Ensure the input is a valid BCH address.
    try {
      utils.toCashAddress(address)
    } catch (err) {
      res.status(400)
      return res.json({
        error: `Invalid BCH address. Double check your address is valid: ${address}`
      })
    }

    // Ensure it is using the correct network.
    const cashAddr: string = utils.toCashAddress(address)
    const networkIsValid: boolean = routeUtils.validateNetwork(cashAddr)
    if (!networkIsValid) {
      res.status(400)
      return res.json({
        error: `Invalid network. Trying to use a testnet address on mainnet, or vice versa.`
      })
    }

    const transactions = await slpDataService.getHistoricalSlpTransactions([address], fromBlock)

    // Structure result data with paginated format for compatibility
    const returnData = {
      txs: transactions,
      pagesTotal: 1,
      currentPage: 0,
    }

    res.status(200)
    return res.json(returnData)
  } catch (err) {
    wlogger.error(`Error in slp.ts/txsByAddressSingle().`, err)

    // Decode the error message.
    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }

    res.status(500)
    return res.json({
      error: `Error in /transactionHistoryAllTokens/:address: ${err.message}`
    })
  }
}

async function txsByAddressBulk(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<express.Response> {
  try {
    const addresses = req.body.addresses

    // Reject if addresses is not an array
    if (!addresses || !Array.isArray(addresses)) {
      res.status(400)
      return res.json({
        error: "addresses needs to be an array. Use GET for single address."
      })
    }

    const fromBlock: number = req.body.fromBlock
      ? parseInt(req.body.fromBlock, 10)
      : 0

    // Enforce array size rate limits
    if (!routeUtils.validateArraySize(req, addresses)) {
      res.status(429)
      return res.json({
        error: `Array too large.`
      })
    }

    // Validate each address
    for (let address of addresses) {
      // Validate input data.
      if (!address || address === "") {
        res.status(400)
        return res.json({ error: "address can not be empty" })
      }

      // Ensure the input is a valid BCH address.
      try {
        utils.toCashAddress(address)
      } catch (err) {
        res.status(400)
        return res.json({
          error: `Invalid BCH address. Double check your address is valid: ${address}`
        })
      }

      // Ensure it is using the correct network.
      const cashAddr: string = utils.toCashAddress(address)
      const networkIsValid: boolean = routeUtils.validateNetwork(cashAddr)
      if (!networkIsValid) {
        res.status(400)
        return res.json({
          error: `Invalid network. Trying to use a testnet address on mainnet, or vice versa.`
        })
      }
    }

    const transactions = await slpDataService.getHistoricalSlpTransactions(addresses, fromBlock)

    // Structure result data with paginated format for compatibility
    const returnData = {
      txs: transactions,
      pagesTotal: 1,
      currentPage: 0,
    }

    res.status(200)
    return res.json(returnData)
  } catch (err) {
    wlogger.error(`Error in slp.ts/txsByAddressBulk().`, err)

    // Decode the error message.
    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }

    res.status(500)
    return res.json({
      error: `Error in /transactionHistoryAllTokens ${err.message}`
    })
  }
}

// Retrieve transactions by tokenId and address.
async function txsTokenIdAddressSingle(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<express.Response> {
  try {
    // Validate the input data.
    const tokenId: string = req.params.tokenId
    if (!tokenId || tokenId === "") {
      res.status(400)
      return res.json({ error: "tokenId can not be empty" })
    }

    const address: string = req.params.address
    if (!address || address === "") {
      res.status(400)
      return res.json({ error: "address can not be empty" })
    }

    const result = await slpDataService.getTransactionsByTokenIdAddressSingle(tokenId, address)

    return res.json(result)
  } catch (err) {
    wlogger.error(`Error in slp.ts/txsTokenIdAddressSingle().`, err)

    // Decode the error message.
    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }

    res.status(500)
    return res.json({
      error: `Error in /transactions/:tokenId/:address: ${err.message}`
    })
  }
}

async function txsTokenIdAddressBulk(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<express.Response> {
  try {
    req.body.forEach((r: any) => {
      // Validate input data.
      if (!r.address || r.address === "") {
        res.status(400)
        return res.json({ error: "address can not be empty" })
      }

      if (!r.tokenId || r.tokenId === "") {
        res.status(400)
        return res.json({ error: "tokenId can not be empty" })
      }

      // Ensure the input is a valid BCH address.
      try {
        utils.toCashAddress(r.address)
      } catch (err) {
        res.status(400)
        return res.json({
          error: `Invalid BCH address. Double check your address is valid: ${r.address}`
        })
      }

      // Prevent a common user error. Ensure they are using the correct network address.
      const cashAddr: string = utils.toCashAddress(r.address)
      const networkIsValid: boolean = routeUtils.validateNetwork(cashAddr)
      if (!networkIsValid) {
        res.status(400)
        return res.json({
          error: `Invalid network. Trying to use a testnet address on mainnet, or vice versa.`
        })
      }
    })

    const tokenIdPromises: Promise<any>[] = req.body.map(async (data: any) => {
      try {
        const result = await slpDataService.getTransactionsByTokenIdAddressSingle(data.tokenId, data.address)

        return result
      } catch (err) {
        throw err
      }
    })
    const axiosResult: any[] = await Promise.all(tokenIdPromises)
    res.status(200)
    return res.json(axiosResult)
  } catch (err) {
    wlogger.error(`Error in slp.ts/txsTokenIdAddressSingle().`, err)

    // Decode the error message.
    const { msg, status } = routeUtils.decodeError(err)
    if (msg) {
      res.status(status)
      return res.json({ error: msg })
    }

    res.status(500)
    return res.json({
      error: `Error in /transactions/:tokenId/:address: ${err.message}`
    })
  }
}

module.exports = {
  router,
  testableComponents: {
    root,
    list,
    listSingleToken,
    listBulkToken,
    balancesForAddressSingle,
    balancesForAddressBulk,
    balancesForAddressByTokenIDSingle,
    balancesForAddressByTokenIDBulk,
    convertAddressSingle,
    convertAddressBulk,
    validateBulk,
    createTokenType1,
    mintTokenType1,
    sendTokenType1,
    burnTokenType1,
    txDetails,
    getSlpjsTxDetails,
    tokenStatsSingle,
    tokenStatsBulk,
    balancesForTokenSingle,
    balancesForTokenBulk,
    txsTokenIdAddressSingle,
    txsTokenIdAddressBulk,
    txsByAddressSingle,
    txsByAddressBulk,
    burnTotalSingle,
    burnTotalBulk
  }
}
