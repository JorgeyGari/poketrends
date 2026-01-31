(async () => {
	const { TrendsApiService } = await import('/src/js/services/TrendsApiService.js');
	const service = new TrendsApiService();

	try {
		const healthy = await service.checkHealth();
		if (!healthy) {
			console.warn('Backend health check failed — continuing with client fallbacks where needed.');
		} else {
			console.log('Backend healthy — will use real Google Trends when available.');
		}

		const tests = [
			{ name: 'pikachu', country: 'US' },
			{ name: 'charizard', country: 'JP' },
			{ name: 'mew', country: 'BR' },
		];

		for (const t of tests) {
			try {
				const score = await service.getTrendsScore(t.name, t.country);
				console.log(`${t.name} (${t.country}) score:`, score);
			} catch (err) {
				console.error(`Error fetching score for ${t.name}:`, err);
			}
		}

		// Batch request test
		const batchNames = ['bulbasaur', 'squirtle', 'jigglypuff'];
		console.log('Requesting batch scores for', batchNames);
		const batch = await service.getBatchScores(batchNames, 'US');
		for (const [name, score] of batch) {
			console.log('BATCH:', name, score);
		}

		console.log('Test script finished.');
	} catch (error) {
		console.error('Test runner error:', error);
	}
})();
