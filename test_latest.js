async function testLatest() {
    const query = `query($search:SearchInput $limit:Int $page:Int $translationType:VaildTranslationTypeEnumType $countryOrigin:VaildCountryOriginEnumType){shows(search:$search limit:$limit page:$page translationType:$translationType countryOrigin:$countryOrigin){edges{_id name availableEpisodes}}}`;
    const res = await fetch("https://api.allanime.day/api", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://allmanga.to' },
        body: JSON.stringify({
            query: query,
            variables: {
                search: { allowAdult: false, allowUnknown: false, sortBy: "Update" },
                limit: 10,
                page: 1,
                translationType: "sub",
                countryOrigin: "ALL"
            }
        })
    });
    console.log(await res.json());
}
testLatest();
