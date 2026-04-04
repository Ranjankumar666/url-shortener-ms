import { Sequelize, DataTypes } from 'sequelize';

const sequelize = new Sequelize(
	process.env.DB_NAME,
	process.env.DB_USER,
	process.env.DB_PASSWORD,
	{
		host: process.env.DB_HOST,
		dialect: 'postgres',
		logging: false, // Set to console.log to see the raw SQL
	},
);

export const Urls = sequelize.define('urls', {
	id: {
		type: DataTypes.INTEGER,
		primaryKey: true,
	},
	url: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	clicked: {
		type: DataTypes.INTEGER,
		defaultValue: 0,
	},
});

export const init = async () => {
	try {
		await sequelize.authenticate();
		console.log('Connection has been established successfully.');

		// sync() creates the table if it doesn't exist
		await sequelize.sync();
	} catch (error) {
		console.error('Unable to connect to the database:', error);
	}
};
