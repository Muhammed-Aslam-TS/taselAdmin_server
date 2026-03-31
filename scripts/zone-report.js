#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import connectDB from '../config/db.js';
import Order from '../model/orderModel.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const res = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--mapping' || a === '-m') res.mapping = args[++i];
    else if (a === '--start' || a === '-s') res.start = args[++i];
    else if (a === '--end' || a === '-e') res.end = args[++i];
    else if (a === '--out' || a === '-o') res.out = args[++i];
    else if (a === '--help' || a === '-h') res.help = true;
    else res._ = res._ || [], res._.push(a);
  }
  return res;
}

function printUsage() {
  console.log(`Usage: node scripts/zone-report.js [options]

Options:
  --mapping, -m  Path to a JSON mapping file (pincode -> zone). Optional.
  --start, -s    ISO date (inclusive) to filter orders by createdAt (e.g. 2025-10-01)
  --end, -e      ISO date (inclusive) to filter orders by createdAt (e.g. 2025-10-24)
  --out, -o      Path to write JSON output
  --help, -h     Show this help

Notes:
  - If orders already contain a zone (shippingAddress.zone or shippingAddress.zoneName) the script will use it.
  - If mapping file is provided it will try to map shippingAddress.zipCode or pincode to a zone id/name.
  - You must set MONGO_URI in your environment before running.
`);
}

function loadMapping(mappingPath) {
  if (!mappingPath) return null;
  const p = path.isAbsolute(mappingPath) ? mappingPath : path.join(process.cwd(), mappingPath);
  if (!fs.existsSync(p)) throw new Error(`Mapping file not found: ${p}`);
  const raw = fs.readFileSync(p, 'utf8');
  let data;
  try { data = JSON.parse(raw); } catch (err) { throw new Error('Mapping file is not valid JSON'); }

  // Normalize mapping into an object: { "560001": "ZONE-A", ... }
  if (Array.isArray(data)) {
    const map = {};
    // try common shapes
    for (const item of data) {
      if (!item) continue;
      if (typeof item === 'object') {
        // possible shapes: {pincode: '560001', zone: 'Z1'} or {zip: '560001', zone_id: '...'} or {space:..., zone_id:...}
        const pincode = item.pincode || item.zipCode || item.zip || item.zip_code || item.postal || item.space_pincode || item.postcode || item.postalCode;
        const zone = item.zone || item.zone_id || item.zoneId || item.zoneName || item.zone_name || item.zoneId || item.zoneIdString || item.zoneNameString;
        if (pincode && zone) map[String(pincode).trim()] = zone;
      }
    }
    return map;
  }

  if (typeof data === 'object') {
    // If it's already a map of pincode -> zone
    // e.g. { "560001": "Z1", ... }
    return data;
  }
  return null;
}

async function run() {
  const opts = parseArgs();
  if (opts.help) { printUsage(); process.exit(0); }

  if (!process.env.MONGO_URI) {
    console.error('Please set MONGO_URI environment variable. e.g. export MONGO_URI="mongodb://..."');
    process.exit(1);
  }

  const mapping = opts.mapping ? loadMapping(opts.mapping) : null;

  await connectDB();

  const query = {};
  if (opts.start || opts.end) {
    query.createdAt = {};
    if (opts.start) query.createdAt.$gte = new Date(opts.start);
    if (opts.end) {
      // include end day by setting time to end of day
      const d = new Date(opts.end);
      d.setHours(23,59,59,999);
      query.createdAt.$lte = d;
    }
  }

  console.log('Running zone report with filter:', JSON.stringify(query));

  const cursor = Order.find(query).cursor();

  const stats = { totalOrders: 0, totalAmount: 0, zones: {} };

  for await (const order of cursor) {
    stats.totalOrders++;
    const amt = Number(order.totalAmount || 0);
    stats.totalAmount += amt;

    // Determine zone
    let zone = null;
    const addr = order.shippingAddress || {};
    if (addr.zone) zone = String(addr.zone);
    else if (addr.zoneName) zone = String(addr.zoneName);
    else if (addr.zone_id) zone = String(addr.zone_id);
    else if (mapping && (addr.zipCode || addr.pincode || addr.zip || addr.postal)) {
      const p = String(addr.zipCode || addr.pincode || addr.zip || addr.postal).trim();
      zone = mapping[p] || mapping[Number(p)] || null;
    }

    if (!zone) zone = 'UNKNOWN';

    if (!stats.zones[zone]) stats.zones[zone] = { count: 0, amount: 0 };
    stats.zones[zone].count += 1;
    stats.zones[zone].amount += amt;
  }

  // Create sorted output
  const zonesArr = Object.entries(stats.zones).map(([zone, v]) => ({ zone, count: v.count, amount: v.amount }));
  zonesArr.sort((a,b) => b.count - a.count);

  const out = { filter: query, totalOrders: stats.totalOrders, totalAmount: stats.totalAmount, zones: zonesArr };

  console.log('\nZone report:');
  console.table(zonesArr.map(z => ({ Zone: z.zone, Count: z.count, Amount: z.amount })));

  if (opts.out) {
    fs.writeFileSync(path.resolve(opts.out), JSON.stringify(out, null, 2), 'utf8');
    console.log('Wrote output to', opts.out);
  } else {
    console.log('\nSummary:', JSON.stringify(out, null, 2));
  }

  process.exit(0);
}

run().catch(err => {
  console.error('Zone report failed:', err.message || err);
  process.exit(1);
});
