import https from 'https';

const url = "https://rr5---sn-nx57ynz7.googlevideo.com/videoplayback?expire=1781555067&ei=--4vapOQBv2a2O8PmKqOGQ&ip=196.51.200.124&id=9496b362f4684be8&itag=18&source=blogger&requiressl=yes&xpc=Egho7Zf3LnoBAQ==&cps=0&met=1781526267,&mh=q6&mm=31&mn=sn-nx57ynz7&ms=au&mv=m&mvi=5&pl=17&rms=au,au&susc=bl&svpuc=1&eaua=6uRl8aq8MPs&mime=video/mp4&vprv=1&rqh=1&dur=1447.160&lmt=1751561751009166&mt=1781525853&txp=1311224&sparams=expire,ei,ip,id,itag,source,requiressl,xpc,susc,svpuc,eaua,mime,vprv,rqh,dur,lmt&sig=AHEqNM4wRAIgJhm7RjENxVomv2hCFPYXqXf_VxDq2-BvT_mLvtjl2DkCIDTMF97N2njATEghpuMDuZ-_hHj7H_LNRo5yWUcqft5f&lsparams=cps,met,mh,mm,mn,ms,mv,mvi,pl,rms&lsig=APaTxxMwRgIhAMkSAg1oCy4tlMnek4KTdEgcjjhtrd62fqZ09Q05hzzQAiEA33u32QN3w13kJUxdnHl_e-LdW5GvgBYLAoJMMZ-mLfI=";

function checkUrl() {
    return new Promise((resolve) => {
        const req = https.request(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://allanime.day',
                'Range': 'bytes=0-100'
            }
        }, (res) => {
            resolve(res.statusCode);
        });
        req.on('error', () => resolve(0));
        req.end();
    });
}

checkUrl().then(s => console.log("GET Status:", s));
