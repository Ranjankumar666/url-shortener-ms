// import { addDoc } from './data_fetch';

import { Kafka } from 'kafkajs';
const SERVICE_NAME = process.env.SERVICE_NAME;

const kafka = new Kafka({
	clientId: SERVICE_NAME,
	brokers: [`${process.env.KAFKA_HOST}:${process.env.KAFKA_PORT}`],
});
const isConnected = false;

const admin = kafka.admin();
const TOPIC = 'db-add';

const producer = kafka.producer();
export const connect = async () => {
	if (!isConnected) {
		await producer.connect();
	}
};

export const disconnet = async () => {
	if (isConnected) {
		await produce.disconnet();
	}
};

export const waitForKafka = async (retries = 100, delayMs = 3000) => {
	for (let i = 0; i < retries; i++) {
		try {
			await admin.connect();
			console.log('Kafka broker reachable');
			return;
		} catch (err) {
			console.log(`Waiting for Kafka broker... (${i + 1}/${retries})`);
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

export const produce = async (data) => {
	await connect();

	await producer.send({
		topic: TOPIC,
		acks: -1,
		messages: [
			{
				value: JSON.stringify(data),
			},
		],
	});
};
