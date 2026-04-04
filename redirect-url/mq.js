import { addDoc } from './data_fetch.js';

import { Kafka } from 'kafkajs';
const SERVICE_NAME = process.env.SERVICE_NAME;
const GROUP_ID = SERVICE_NAME;
const TOPICS = {
	ADD: 'db-add',
	UPDATE: 'db-update',
};

const kafka = new Kafka({
	clientId: SERVICE_NAME,
	brokers: [`${process.env.KAFKA_HOST}:${process.env.KAFKA_PORT}`],
});

const admin = kafka.admin();

const consumer = kafka.consumer({
	groupId: GROUP_ID,
});
const producer = kafka.producer({
	allowAutoTopicCreation: true,
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

	for (let topic in Object.keys(TOPICS)) {
		if (!topics.includes(topic)) {
			console.log(`Creating topic: ${topic}`);
			await admin.createTopics({
				topics: [
					{ topic: topic, numPartitions: 1, replicationFactor: 1 },
				],
			});
			console.log(`Topic ${topic} created`);
		} else {
			console.log(`Topic ${topic} already exists`);
		}
	}
};

export const consume = async () => {
	await consumer.connect();
	await consumer.subscribe({
		topic: TOPICS.ADD,
		fromBeginning: true,
	});

	consumer.run({
		eachMessage: async ({ topic, message, partition }) => {
			try {
				const data = JSON.parse(message.value);
				await addDoc(data);
				await consumer.commitOffsets([
					{
						partition,
						topic,
						offset: (+message.offset + 1).toString(),
					},
				]);
			} catch (err) {
				console.log('Error while processing ' + topic);
				console.log(err.message);
			}
		},

		autoCommit: false,
	});
};

export const produce = async ({ id }) => {
	await producer.connect();
	await producer.send([
		{
			topic: TOPICS.UPDATE,
			ack: -1,
			messages: [
				{
					value: JSON.stringify({ id }, (key, value) => {
						if (typeof value === 'bigint') return value.toString();
						return value;
					}),
				},
			],
		},
	]);
};
