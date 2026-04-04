import express from 'express';
import { init } from './db.js';
import { consume, ensureTopicExists, produce, waitForKafka } from './mq.js';
import { getDocByPk, updateDoc } from './data_fetch.js';
import { decode } from './codec.js';
const PORT = process.env.PORT || 6000;
const app = express();
app.use(express.json());

app.get('/r/:token', async function (req, res) {
	const { token } = req.params;
	const id = decode(token);

	//TODO: Get the doc from Database
	const doc = await getDocByPk(id);
	//TODO: Send a redirect response
	if (!doc) {
		return res.status(404).json({
			msg: 'Url not found',
		});
	}

	await updateDoc({ id });
	produce({ id });

	res.redirect(302, doc.url);
});

app.get('/r/health', (req, res) => {
	res.status(200).json({ status: 'ok' });
});

app.listen(PORT, async () => {
	await init();
	await waitForKafka();
	await ensureTopicExists();
	await consume();
	console.log('Redirect Service Started at ' + PORT);
});
