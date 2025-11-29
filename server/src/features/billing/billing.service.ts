import { OrganizationModel } from '@/features/organizations/organizations.model';
import { CreditTransactionModel } from './billing.model';
import { CreditOperation } from './billing.types';
import { AppError } from '@/shared/errors/app-error';
import { HttpStatus } from '@/utils/http-status';
import { logger } from '@/utils/logger';

export const CREDIT_COSTS: Record<CreditOperation, number> = {
  'workflow-run': 1,
  'nillion-compute': 5,
  'nillion-block-graph': 3,
  'nillion-math-logic': 1,
  'nilai-llm': 10,
  'state-store': 1,
  'state-read': 1,
  'zcash-send': 2,
  'connector-request': 1,
  'custom-http-action': 1,
};

const getCreditCost = (operation: string): number => {
  return CREDIT_COSTS[operation as CreditOperation] ?? 0;
};

const getCredits = async (organizationId: string): Promise<number> => {
  const org = await OrganizationModel.findById(organizationId).select('credits').lean();
  if (!org) {
    throw new AppError('Organization not found', HttpStatus.NOT_FOUND);
  }
  return org.credits;
};

const hasEnoughCredits = async (organizationId: string, amount: number): Promise<boolean> => {
  const credits = await getCredits(organizationId);
  return credits >= amount;
};

const deductCredits = async (
  organizationId: string,
  amount: number,
  reason?: string,
  operation?: CreditOperation,
): Promise<{ remaining: number; deducted: number }> => {
  const org = await OrganizationModel.findById(organizationId);
  if (!org) {
    throw new AppError('Organization not found', HttpStatus.NOT_FOUND);
  }

  if (org.credits < amount) {
    throw new AppError(
      `Insufficient credits. Required: ${amount}, Available: ${org.credits}`,
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  org.credits -= amount;
  org.totalCreditsUsed += amount;
  await org.save();

  await CreditTransactionModel.create({
    organization: organizationId,
    type: 'debit',
    amount,
    operation,
    reason,
    balanceAfter: org.credits,
  });

  logger.info({ organizationId, reason, deducted: amount, remaining: org.credits }, 'Credits deducted');

  return { remaining: org.credits, deducted: amount };
};

const addCredits = async (
  organizationId: string,
  amount: number,
  reason?: string,
): Promise<{ credits: number }> => {
  if (amount <= 0) {
    throw new AppError('Amount must be positive', HttpStatus.BAD_REQUEST);
  }

  const org = await OrganizationModel.findByIdAndUpdate(
    organizationId,
    { $inc: { credits: amount } },
    { new: true },
  );

  if (!org) {
    throw new AppError('Organization not found', HttpStatus.NOT_FOUND);
  }

  await CreditTransactionModel.create({
    organization: organizationId,
    type: 'credit',
    amount,
    reason,
    balanceAfter: org.credits,
  });

  logger.info({ organizationId, added: amount, total: org.credits }, 'Credits added');

  return { credits: org.credits };
};

const calculateWorkflowCost = (blockIds: string[]): number => {
  let total = CREDIT_COSTS['workflow-run'];
  for (const blockId of blockIds) {
    const cost = getCreditCost(blockId);
    if (cost > 0) {
      total += cost;
    }
  }
  return total;
};

const preflightCreditCheck = async (
  organizationId: string,
  requiredCredits: number,
): Promise<{ hasEnough: boolean; required: number; available: number }> => {
  const available = await getCredits(organizationId);
  return {
    hasEnough: available >= requiredCredits,
    required: requiredCredits,
    available,
  };
};

const getTransactionHistory = async (organizationId: string, limit = 50) => {
  return CreditTransactionModel.find({ organization: organizationId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

const getAllCreditCosts = (): Record<string, number> => {
  return { ...CREDIT_COSTS };
};

export const billingService = {
  getCreditCost,
  getCredits,
  hasEnoughCredits,
  deductCredits,
  addCredits,
  calculateWorkflowCost,
  preflightCreditCheck,
  getTransactionHistory,
  getAllCreditCosts,
};

export {
  getCreditCost,
  getCredits,
  hasEnoughCredits,
  deductCredits,
  addCredits,
  calculateWorkflowCost,
  preflightCreditCheck,
  getTransactionHistory,
  getAllCreditCosts,
};