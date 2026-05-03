import { kv } from '@vercel/kv';

const KV_KEY = 'sim:results:latest';

export default async function handler(req, res) {
    if (req.method === 'GET') {
        const data = await kv.get(KV_KEY);
        if (!data) return res.status(404).json({ error: 'No saved results' });
        return res.status(200).json(data);
    }

    if (req.method === 'POST') {
        const { results, matchesPerPair, timestamp } = req.body;
        await kv.set(KV_KEY, { results, matchesPerPair, timestamp });
        return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
}
