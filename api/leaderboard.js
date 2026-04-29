import { kv } from '@vercel/kv';

// All 16 fighter names — used to fetch win counts in one batch.
const FIGHTER_NAMES = [
    'Dash', 'Titan', 'Dracula', 'Ninja', 'Zerk', 'Paladin', 'Venom', 'Mage',
    'Spike', 'Sniper', 'Hook', 'Ghost', 'Pulsar', 'Swarm', 'Thorn', 'Comet',
    'Enma', 'Malik', 'Vanta'
];

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Fetch all win counts in parallel
        const counts = await Promise.all(
            FIGHTER_NAMES.map(name => kv.get(`wins:${name}`))
        );

        const leaderboard = FIGHTER_NAMES
            .map((name, i) => ({ name, wins: counts[i] ?? 0 }))
            .sort((a, b) => b.wins - a.wins);

        res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
        return res.status(200).json(leaderboard);
    } catch (err) {
        console.error('KV read failed:', err);
        return res.status(503).json({ error: 'Storage unavailable' });
    }
}
