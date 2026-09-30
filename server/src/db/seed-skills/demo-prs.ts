/**
 * L02 control-experiment PRs for `acme/payments-api` (spec: specs/L02-review-skills.md).
 * Each file is a synthetic unified-diff hunk; the review pipeline falls back to
 * `pr_files.patch` when the repo is not cloned (reviews/diff-loader.ts).
 *
 * Hunks are written as prefixed lines (' ', '+', '-') and the `@@` header is
 * computed, so line counts are always consistent with the body.
 */

export interface DemoPrFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string;
}

export interface DemoPr {
  number: number;
  title: string;
  author: string;
  branch: string;
  headSha: string;
  body: string;
  commitMessage: string;
  files: DemoPrFile[];
}

/** Build a file entry from one hunk starting at the given old/new line. */
function file(path: string, oldStart: number, newStart: number, lines: string[]): DemoPrFile {
  const oldLines = lines.filter((l) => l.startsWith(' ') || l.startsWith('-')).length;
  const newLines = lines.filter((l) => l.startsWith(' ') || l.startsWith('+')).length;
  const additions = lines.filter((l) => l.startsWith('+')).length;
  const deletions = lines.filter((l) => l.startsWith('-')).length;
  const header = `@@ -${oldStart},${oldLines} +${newStart},${newLines} @@`;
  return { path, additions, deletions, patch: [header, ...lines].join('\n') };
}

/** A brand-new file: every line is an addition. */
function newFile(path: string, source: string): DemoPrFile {
  return file(path, 0, 1, source.split('\n').map((l) => `+${l}`));
}

const DISCOUNT_SRC = `export const MAX_DISCOUNT_CENTS = 5_000;

export interface Coupon {
  code: string;
  percentOff: number;
  expiresAt: Date;
}

/** Discount in cents for an order amount and an optional coupon. */
export function calculateDiscount(
  amountCents: number,
  coupon: Coupon | null,
  now: Date = new Date(),
): number {
  if (amountCents < 0) {
    throw new RangeError('amountCents must be >= 0');
  }
  if (amountCents === 0 || coupon === null) {
    return 0;
  }
  if (coupon.expiresAt.getTime() <= now.getTime()) {
    return 0;
  }
  const raw = Math.floor((amountCents * coupon.percentOff) / 100);
  if (raw > MAX_DISCOUNT_CENTS) {
    return MAX_DISCOUNT_CENTS;
  }
  return raw;
}`;

const DISCOUNT_TEST_SRC = `import { describe, it, expect } from 'vitest';
import { calculateDiscount } from '../../src/pricing/discount.js';

describe('calculateDiscount', () => {
  it('applies the coupon percentage', () => {
    const coupon = { code: 'SPRING10', percentOff: 10, expiresAt: new Date('2099-01-01') };
    expect(calculateDiscount(10_000, coupon)).toBe(1_000);
  });
});`;

const PR_483: DemoPr = {
  number: 483,
  title: 'Add discount calculation',
  author: 'dev.okafor',
  branch: 'feat/coupon-discounts',
  headSha: 'b4c5d6e7f8a9',
  body: 'Adds coupon-based discounts at checkout. Discounts are capped at $50 and expired coupons are ignored.',
  commitMessage: 'Add calculateDiscount and wire it into checkout',
  files: [
    newFile('src/pricing/discount.ts', DISCOUNT_SRC),
    newFile('test/pricing/discount.test.ts', DISCOUNT_TEST_SRC),
    file('src/api/checkout.ts', 1, 1, [
      " import type { FastifyInstance } from 'fastify';",
      " import { OrdersService } from '../services/orders.js';",
      "+import { calculateDiscount } from '../pricing/discount.js';",
      ' ',
      ' export default async function checkoutRoutes(app: FastifyInstance) {',
      '   const orders = new OrdersService(app.db);',
      ' ',
      "   app.post('/checkout', async (req) => {",
      '     const order = await orders.draft(req.body);',
      '-    return orders.finalize(order, { discountCents: 0 });',
      '+    const coupon = await orders.findCoupon(order.couponCode);',
      '+    const discountCents = calculateDiscount(order.totalCents, coupon);',
      '+    return orders.finalize(order, { discountCents });',
      '   });',
      ' }',
    ]),
  ],
};

const PR_484: DemoPr = {
  number: 484,
  title: 'Rename user lookup route',
  author: 'lena.fischer',
  branch: 'refactor/user-route-naming',
  headSha: 'c7d8e9f0a1b2',
  body: 'Naming cleanup: `userId` instead of `id` in the user route, `emailAddress` in responses to match the new data model, and users now carry their tenant.',
  commitMessage: 'Rename user route param and response fields',
  files: [
    file('src/api/users.ts', 1, 1, [
      " import type { FastifyInstance } from 'fastify';",
      " import { z } from 'zod';",
      " import { UsersService } from '../services/users.js';",
      ' ',
      ' const CreateUserBody = z.object({',
      '   name: z.string().min(1),',
      '   email: z.string().email(),',
      '+  tenantId: z.string().uuid(),',
      ' });',
      ' ',
      ' const UserResponse = z.object({',
      '   id: z.string().uuid(),',
      '   name: z.string(),',
      '-  email: z.string().email(),',
      '+  emailAddress: z.string().email(),',
      '   createdAt: z.string(),',
      ' });',
      ' ',
      ' export default async function usersRoutes(app: FastifyInstance) {',
      '   const users = new UsersService(app.db);',
      ' ',
      "-  app.get('/users/:id', async (req) => {",
      '-    const { id } = req.params as { id: string };',
      '-    const user = await users.findById(id);',
      "+  app.get('/users/:userId', async (req) => {",
      '+    const { userId } = req.params as { userId: string };',
      '+    const user = await users.findById(userId);',
      '     if (!user) throw app.httpErrors.notFound();',
      '-    return UserResponse.parse(user);',
      '+    return UserResponse.parse({ ...user, emailAddress: user.email });',
      '   });',
      ' ',
      "   app.post('/users', async (req, reply) => {",
      '     const body = CreateUserBody.parse(req.body);',
      '-    const user = await users.create(body);',
      '+    const user = await users.create(body, body.tenantId);',
      '     reply.status(201);',
      '-    return UserResponse.parse(user);',
      '+    return UserResponse.parse({ ...user, emailAddress: user.email });',
      '   });',
      ' }',
    ]),
    file('src/services/users.ts', 14, 14, [
      '-  async create(input: { name: string; email: string }) {',
      '+  async create(input: { name: string; email: string }, tenantId: string) {',
      '     const [row] = await this.db',
      '       .insert(users)',
      '-      .values({ name: input.name, email: input.email })',
      '+      .values({ name: input.name, email: input.email, tenantId })',
      '       .returning();',
      '     return row;',
      '   }',
    ]),
  ],
};

export const DEMO_PRS: readonly DemoPr[] = [PR_483, PR_484];
