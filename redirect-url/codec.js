const base62Char =
	'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._~';
const base62CharMap = base62Char.split('').reduce((acc, chr, idx) => {
	acc[chr] = idx;
	return acc;
}, {});
const base = 66n;
const mask = 1n << 63n;

export const encode = (num) => {
	num = BigInt(num);
	num ^= mask;
	const res = [];
	while (num > 0n) {
		const rem = num % base;
		num = num / base;
		res.push(base62Char[rem]);
	}

	return res.reverse().join('');
};

export const decode = (str) => {
	str = str.split('');
	let res = 0n;
	str.reverse().forEach((chr, idx) => {
		res += base ** BigInt(idx) * BigInt(base62CharMap[chr]);
	});

	// return res ^ mask;
	return res ^ mask;
};
