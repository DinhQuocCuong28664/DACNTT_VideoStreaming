#!/usr/bin/env node
/**
 * Unit prices for the cost comparison (S5, measurement 7), read from the AWS Price List API.
 *
 *   node scripts/bench/cost.mjs --out docs/results/runs/2026-11-05-v2-prices.json
 *
 * Asia Pacific (Singapore), on-demand list prices in USD: Fargate (Linux/x86, vCPU-hour and
 * GB-hour, on-demand and Spot where the list has it), the EC2 instances an always-on worker
 * would use, Lambda and S3 Standard. Only prices are stored;
 * the comparison with the measured vCPU-seconds is done from these numbers in the report.
 * Spot prices change over time; the list price of Fargate Spot, when absent, is left null.
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { GetProductsCommand, PricingClient } from '@aws-sdk/client-pricing';
import { today, writeResults } from './lib.mjs';

const { values: o } = parseArgs({ options: { out: { type: 'string' }, instances: { type: 'string', default: 't3.medium,t3.xlarge,c6i.xlarge,c6i.2xlarge' } } });
if (!o.out) throw new Error('--out is required');
const pricing = new PricingClient({ region: 'us-east-1' });
const LOCATION = 'Asia Pacific (Singapore)';

async function products(ServiceCode, filters) {
  const Filters = Object.entries(filters).map(([Field, Value]) => ({ Type: 'TERM_MATCH', Field, Value }));
  const out = [];
  let NextToken;
  do {
    const page = await pricing.send(new GetProductsCommand({ ServiceCode, Filters, NextToken, MaxResults: 100 }));
    out.push(...page.PriceList.map((p) => JSON.parse(p)));
    NextToken = page.NextToken;
  } while (NextToken);
  return out;
}

/** The single on-demand price dimension of a product: { usd, unit, description }. */
function onDemand(p) {
  const term = Object.values(p.terms?.OnDemand ?? {})[0];
  const dims = Object.values(term?.priceDimensions ?? {});
  const first = dims.find((d) => Number(d.pricePerUnit?.USD) > 0) ?? dims[0];
  return first ? { usd: Number(first.pricePerUnit.USD), unit: first.unit, description: first.description } : null;
}

const fargate = {};
for (const p of await products('AmazonECS', { location: LOCATION })) {
  const u = p.product.attributes.usagetype ?? '';
  const price = onDemand(p);
  if (!price || !/Fargate/.test(u) || /ARM|Windows|Ephemeral/i.test(u)) continue;
  if (/SpotUsage-Fargate-vCPU-Hours/.test(u)) fargate.spot_vcpu_hour = price.usd;
  else if (/SpotUsage-Fargate-GB-Hours/.test(u)) fargate.spot_gb_hour = price.usd;
  else if (/Fargate-vCPU-Hours:perCPU/.test(u)) fargate.vcpu_hour = price.usd;
  else if (/Fargate-GB-Hours/.test(u)) fargate.gb_hour = price.usd;
}

const ec2 = {};
for (const type of o.instances.split(',')) {
  const list = await products('AmazonEC2', { location: LOCATION, instanceType: type, operatingSystem: 'Linux', tenancy: 'Shared', preInstalledSw: 'NA', capacitystatus: 'Used' });
  const p = list.find((x) => onDemand(x)?.unit === 'Hrs');
  if (p) ec2[type] = { usd_hour: onDemand(p).usd, vcpu: Number(p.product.attributes.vcpu), memory: p.product.attributes.memory };
}

const lambda = {};
for (const p of await products('AWSLambda', { location: LOCATION })) {
  const u = p.product.attributes.usagetype ?? '';
  const price = onDemand(p);
  if (!price) continue;
  if (/^APS1-Request$/.test(u)) lambda.request = price.usd;
  if (/^APS1-Lambda-GB-Second$/.test(u)) lambda.gb_second = price.usd;
}

const s3 = {};
for (const p of await products('AmazonS3', { location: LOCATION, storageClass: 'General Purpose', volumeType: 'Standard' })) {
  const price = onDemand(p);
  if (price && price.unit === 'GB-Mo') s3.standard_gb_month = s3.standard_gb_month ?? price.usd;
}

const date = today();
const record = {
  id: `${date}-aws-prices-singapore`,
  date,
  path: 'prices',
  region: 'ap-southeast-1',
  currency: 'USD',
  fargate,
  ec2,
  lambda,
  s3,
  provenance: 'aws-price-list-api',
  source: 'scripts/bench/cost.mjs',
};
console.log(JSON.stringify(record, null, 2));
writeResults(resolve(o.out), 'AWS list prices used by the cost comparison', [record]);
