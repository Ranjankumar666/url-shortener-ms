import express from 'express';
import { init, disconnectDb } from './db.js';
import { disconnet, ensureTopicExists, waitForKafka } from './mq.js';
import { addDoc } from './data_fetch.js';
import { encode } from './codec.js';

const PORT = process.env.PORT || 6001;
const app = express();
app.use(express.json());

app.post('/api/url/store/', async function (req, res) {
	const { url } = req.body;
	// const id = decode(token);

	const doc = await addDoc({ url });

	res.status(201).json({
		url: process.env.WEB_HOST + encode(doc.id),
	});
});

app.get('/api/url/:id', async function (req, res) {
	const { id } = req.params;
	// const id = decode(token);

	res.status(200).json({
		url: process.env.WEB_HOST + encode(id),
	});
});

app.get('/api/health', (req, res) => {
	res.status(200).json({ status: 'ok' });
});

app.listen(PORT, async () => {
	await init();
	await waitForKafka();
	await ensureTopicExists();
	console.log('Store Service Started at ' + PORT);
});

process.on('SIGINT', async () => {
	await disconnet();
	await disconnectDb();
});
