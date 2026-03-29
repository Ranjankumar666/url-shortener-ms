const base62Char =
	'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const base62CharMap = base62Char.split('').reduce((acc, chr, idx) => {
	acc[chr] = idx;
	return acc;
}, {});
const base = 62;

const mask = 151638;

export const encode = (num) => {
	// num = BigInt(num);
	num ^= mask;
	const res = [];
	while (num > 0) {
		const rem = num % base;
		num = Math.floor(num / base);
		res.push(base62Char[rem]);
	}

	return res.reverse().join('');
};

export const decode = (str) => {
	str = str.split('');
	let res = 0;
	str.reverse().forEach((chr, idx) => {
		res += Math.pow(base, idx) * base62CharMap[chr];
	});

	return res ^ mask;
};

console.log(encode(5000));
