import { addDoc } from './data_fetch.js';

import { Kafka } from 'kafkajs';
const SERVICE_NAME = process.env.SERVICE_NAME;
const GROUP_ID = SERVICE_NAME;
const TOPIC = 'db-add';

const kafka = new Kafka({
	clientId: SERVICE_NAME,
	brokers: [`${process.env.KAFKA_HOST}:${process.env.KAFKA_PORT}`],
});

const admin = kafka.admin();

const consumer = kafka.consumer({
	groupId: GROUP_ID,
});

export const waitForKafka = async (retries = 100, delayMs = 3000) => {
	for (let i = 0; i < retries; i++) {
		try {
			await admin.connect();
			console.log('Kafka broker reachable');
			return;
		} catch (err) {
			console.log(`Waiting for Kafka broker... (${i + 1}/${retries})`);
			console.log(err.message);
			await new Promise((r) => setTimeout(r, delayMs));
		}
	}
	throw new Error('Kafka broker not reachable after multiple attempts');
};

export const ensureTopicExists = async () => {
	const topics = await admin.listTopics();
	if (!topics.includes(TOPIC)) {
		console.log(`Creating topic: ${TOPIC}`);
		await admin.createTopics({
			topics: [{ topic: TOPIC, numPartitions: 1, replicationFactor: 1 }],
		});
		console.log(`Topic ${TOPIC} created`);
	} else {
		console.log(`Topic ${TOPIC} already exists`);
	}
};

export const consume = async () => {
	await consumer.connect();
	await consumer.subscribe({
		topic: TOPIC,
		fromBeginning: true,
	});

	consumer.run({
		eachMessage: async ({ topic, message }) => {
			try {
				const data = JSON.parse(message.value);
				await addDoc(data);
			} catch (err) {
				console.log('Error while processing ' + topic);
				console.log(err.message);
			}
		},
	});
};
