import { randomUUID } from 'node:crypto'
import type { PoolClient, QueryResultRow } from 'pg'

import {
  BranchScopeService,
  type AuthorizationQueryClient,
} from '../authorization/branch-scope-service.js'
import type {
  TransactionOptions,
  TransactionWork,
} from '../database/transaction.js'

export type SerialOperationalStatus =
  | 'STOCK_IN'
  | 'RESERVED'
  | 'SOLD'

export type SerialErrorReason =
  | 'MOVEMENT_LINE_NOT_FOUND'
  | 'SERIAL_TRACKING_DISABLED'
  | 'SERIAL_COUNT_MISMATCH'
  | 'SERIAL_QUANTITY_MUST_BE_WHOLE'
  | 'MOVEMENT_DIRECTION_MISMATCH'
  | 'SERIAL_NOT_FOUND'
  | 'SERIAL_VARIANT_MISMATCH'
  | 'SERIAL_ALREADY_AVAILABLE'
  | 'SERIAL_NOT_AVAILABLE'
  | 'SERIAL_WAREHOUSE_MISMATCH'
  | 'DUPLICATE_SERIAL_INPUT'

export class SerialInventoryError extends Error {
  readonly reason: SerialErrorReason

  constructor(reason: SerialErrorReason) {
    super('Serial inventory operation rejected')
    this.name = 'SerialInventoryError'
    this.reason = reason
  }
}

export interface SerialInventoryTransactionRunner {
  transaction<T>(
    work: TransactionWork<T>,
    options?: TransactionOptions,
  ): Promise<T>
}

export interface SerialMovementInput {
  actorUserId: string
  movementLineId: string
  serialNumbers: readonly string[]
}

export interface SerialRecord {
  id: string
  variantId: string
  serialNumber: string
  currentWarehouseId: string | null
  status: string
  createdAt: Date
}

interface MovementLineContextRow extends QueryResultRow {
  movement_line_id: string
  variant_id: string
  quantity_signed: string
  warehouse_id: string
  branch_id: string
  tracking_serial: boolean
}

interface SerialRow extends QueryResultRow {
  id: string
  variant_id: string
  serial_number: string
  current_warehouse_id: string | null
  status: string
  created_at: Date
}

function requireNonBlank(name: string, value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
  return value.trim()
}

function normalizeSerials(values: readonly string[]): readonly string[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError('serialNumbers must contain at least one serial')
  }

  const normalized = values.map((value, index) =>
    requireNonBlank(`serialNumbers[${index}]`, value),
  )
  const unique = new Set(normalized)
  if (unique.size !== normalized.length) {
    throw new SerialInventoryError('DUPLICATE_SERIAL_INPUT')
  }

  return Object.freeze([...unique].sort((a, b) => a.localeCompare(b)))
}

function parseWholeQuantity(value: string): bigint {
  const match = /^(-?)(\d{1,12})(?:\.(\d{1,6}))?$/.exec(value)
  if (!match) {
    throw new TypeError('movement quantity must be numeric(18,6)')
  }
  const fraction = (match[3] ?? '').padEnd(6, '0')
  if (fraction !== '000000') {
    throw new SerialInventoryError('SERIAL_QUANTITY_MUST_BE_WHOLE')
  }
  const absolute = BigInt(match[2] ?? '0')
  return match[1] === '-' ? -absolute : absolute
}

function mapSerial(row: SerialRow): SerialRecord {
  return Object.freeze({
    id: row.id,
    variantId: row.variant_id,
    serialNumber: row.serial_number,
    currentWarehouseId: row.current_warehouse_id,
    status: row.status,
    createdAt: row.created_at,
  })
}

async function readMovementLineContext(
  client: PoolClient,
  movementLineId: string,
): Promise<MovementLineContextRow> {
  const result = await client.query<MovementLineContextRow>(
    `SELECT
       iml.id AS movement_line_id,
       iml.variant_id,
       iml.quantity_signed::text AS quantity_signed,
       im.warehouse_id,
       im.branch_id,
       p.tracking_serial
     FROM inventory_movement_lines iml
     JOIN inventory_movements im ON im.id=iml.movement_id
     JOIN product_variants pv ON pv.id=iml.variant_id
     JOIN products p ON p.id=pv.product_id
    WHERE iml.id=$1`,
    [movementLineId],
  )
  const row = result.rows[0]
  if (!row) {
    throw new SerialInventoryError('MOVEMENT_LINE_NOT_FOUND')
  }
  if (!row.tracking_serial) {
    throw new SerialInventoryError('SERIAL_TRACKING_DISABLED')
  }
  return row
}

async function lockExistingSerials(
  client: PoolClient,
  variantId: string,
  serialNumbers: readonly string[],
): Promise<Map<string, SerialRow>> {
  const result = await client.query<SerialRow>(
    `SELECT
       id,variant_id,serial_number,current_warehouse_id,status,created_at
     FROM serial_numbers
    WHERE variant_id=$1
      AND serial_number=ANY($2::text[])
    ORDER BY serial_number,id
    FOR UPDATE`,
    [variantId, serialNumbers],
  )
  return new Map(result.rows.map((row) => [row.serial_number, row]))
}

function assertCount(quantity: bigint, count: number): void {
  const absolute = quantity < 0n ? -quantity : quantity
  if (absolute !== BigInt(count)) {
    throw new SerialInventoryError('SERIAL_COUNT_MISMATCH')
  }
}

export class SerialInventoryService {
  private readonly branchScope: BranchScopeService

  constructor(
    private readonly database: SerialInventoryTransactionRunner,
  ) {
    this.branchScope = new BranchScopeService(database)
  }

  async receiveWithinTransaction(
    client: PoolClient,
    input: SerialMovementInput,
  ): Promise<readonly SerialRecord[]> {
    requireNonBlank('actorUserId', input.actorUserId)
    const movementLineId = requireNonBlank(
      'movementLineId',
      input.movementLineId,
    )
    const serialNumbers = normalizeSerials(input.serialNumbers)
    const context = await readMovementLineContext(client, movementLineId)
    await this.branchScope.requireWithinTransaction(
      client as AuthorizationQueryClient,
      input.actorUserId,
      context.branch_id,
    )

    const quantity = parseWholeQuantity(context.quantity_signed)
    if (quantity <= 0n) {
      throw new SerialInventoryError('MOVEMENT_DIRECTION_MISMATCH')
    }
    assertCount(quantity, serialNumbers.length)

    const locked = await lockExistingSerials(
      client,
      context.variant_id,
      serialNumbers,
    )

    const records: SerialRecord[] = []
    for (const serialNumber of serialNumbers) {
      const existing = locked.get(serialNumber)
      if (
        existing &&
        (existing.status === 'STOCK_IN' ||
          existing.status === 'RESERVED' ||
          existing.current_warehouse_id !== null)
      ) {
        throw new SerialInventoryError('SERIAL_ALREADY_AVAILABLE')
      }

      let row: SerialRow | undefined
      if (existing) {
        const updated = await client.query<SerialRow>(
          `UPDATE serial_numbers
              SET current_warehouse_id=$2,
                  status='STOCK_IN'
            WHERE id=$1
            RETURNING id,variant_id,serial_number,current_warehouse_id,status,created_at`,
          [existing.id, context.warehouse_id],
        )
        row = updated.rows[0]
      } else {
        const inserted = await client.query<SerialRow>(
          `INSERT INTO serial_numbers
            (id,variant_id,serial_number,current_warehouse_id,status,created_at)
           VALUES ($1,$2,$3,$4,'STOCK_IN',clock_timestamp())
           RETURNING id,variant_id,serial_number,current_warehouse_id,status,created_at`,
          [randomUUID(), context.variant_id, serialNumber, context.warehouse_id],
        )
        row = inserted.rows[0]
      }

      if (!row) {
        throw new Error('Serial receive invariant failed')
      }
      await client.query(
        `INSERT INTO inventory_line_serials (movement_line_id,serial_id)
         VALUES ($1,$2)`,
        [movementLineId, row.id],
      )
      records.push(mapSerial(row))
    }

    return Object.freeze(records)
  }

  async issueWithinTransaction(
    client: PoolClient,
    input: SerialMovementInput,
  ): Promise<readonly SerialRecord[]> {
    requireNonBlank('actorUserId', input.actorUserId)
    const movementLineId = requireNonBlank(
      'movementLineId',
      input.movementLineId,
    )
    const serialNumbers = normalizeSerials(input.serialNumbers)
    const context = await readMovementLineContext(client, movementLineId)
    await this.branchScope.requireWithinTransaction(
      client as AuthorizationQueryClient,
      input.actorUserId,
      context.branch_id,
    )

    const quantity = parseWholeQuantity(context.quantity_signed)
    if (quantity >= 0n) {
      throw new SerialInventoryError('MOVEMENT_DIRECTION_MISMATCH')
    }
    assertCount(quantity, serialNumbers.length)

    const locked = await lockExistingSerials(
      client,
      context.variant_id,
      serialNumbers,
    )

    const records: SerialRecord[] = []
    for (const serialNumber of serialNumbers) {
      const existing = locked.get(serialNumber)
      if (!existing) {
        throw new SerialInventoryError('SERIAL_NOT_FOUND')
      }
      if (existing.variant_id !== context.variant_id) {
        throw new SerialInventoryError('SERIAL_VARIANT_MISMATCH')
      }
      if (
        existing.status !== 'STOCK_IN' ||
        existing.current_warehouse_id === null
      ) {
        throw new SerialInventoryError('SERIAL_NOT_AVAILABLE')
      }
      if (existing.current_warehouse_id !== context.warehouse_id) {
        throw new SerialInventoryError('SERIAL_WAREHOUSE_MISMATCH')
      }

      await client.query(
        `INSERT INTO inventory_line_serials (movement_line_id,serial_id)
         VALUES ($1,$2)`,
        [movementLineId, existing.id],
      )
      const updated = await client.query<SerialRow>(
        `UPDATE serial_numbers
            SET current_warehouse_id=NULL,
                status='SOLD'
          WHERE id=$1
          RETURNING id,variant_id,serial_number,current_warehouse_id,status,created_at`,
        [existing.id],
      )
      const row = updated.rows[0]
      if (!row) {
        throw new Error('Serial issue invariant failed')
      }
      records.push(mapSerial(row))
    }

    return Object.freeze(records)
  }

  async getCurrent(input: {
    actorUserId: string
    variantId: string
    serialNumber: string
  }): Promise<SerialRecord | null> {
    requireNonBlank('actorUserId', input.actorUserId)
    const variantId = requireNonBlank('variantId', input.variantId)
    const serialNumber = requireNonBlank('serialNumber', input.serialNumber)

    return this.database.transaction(async (client) => {
      const result = await client.query<
        SerialRow & { branch_id: string | null } & QueryResultRow
      >(
        `SELECT
           sn.id,sn.variant_id,sn.serial_number,sn.current_warehouse_id,
           sn.status,sn.created_at,w.branch_id
         FROM serial_numbers sn
         LEFT JOIN warehouses w ON w.id=sn.current_warehouse_id
        WHERE sn.variant_id=$1 AND sn.serial_number=$2`,
        [variantId, serialNumber],
      )
      const row = result.rows[0]
      if (!row) return null
      if (row.current_warehouse_id !== null && row.branch_id) {
        await this.branchScope.requireWithinTransaction(
          client as AuthorizationQueryClient,
          input.actorUserId,
          row.branch_id,
        )
      }
      return mapSerial(row)
    })
  }
}
