import { addToBF, addToCache, checkBF, redis } from './cache.js';
import { Urls } from './db.js';
import { produce } from './mq.js';

export const getDocByPk = async (pk) => {
	const dbDOC = await Urls.findByPk(pk, {
		attributes: ['url'],
	});

	return dbDOC;
};

export const addDoc = async ({ url }) => {
	const doc = await Urls.create({
		url,
	});

	await addToBF(doc.id);
	await addToCache(doc.id, JSON.stringify(doc.toJSON()));

	await produce(doc.toJSON());
	return doc;
};
