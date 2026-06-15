import fs from 'fs';

fetch('https://gogoanime.by/?s=attack+on+titan')
.then(r => r.text())
.then(html => {
    fs.writeFileSync('gogo_search.html', html);
    const matches = [...html.matchAll(/href=["'](?:https?:\/\/[^\/]+)?\/(?:series|category|anime)\/([^"'/]+)\/?["'][^>]*title=["']([^"']+)["']/gi)];
    console.log("Matches:", matches.length);
    console.log(matches.map(m => m[1] + ' | ' + m[2]));
});
