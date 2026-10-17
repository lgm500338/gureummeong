// 구름멍 날씨 중계 함수 (Vercel Serverless Function)
// 노르웨이 기상청(MET Norway) 데이터를 받아 앱에 전달해요.
//   /api/sky              → 여행지 전체의 지금 날씨
//   /api/sky?lat=..&lon=.. → 지도에서 누른 곳 한 군데의 지금 날씨
// 결과는 Vercel이 30분 동안 저장해두고 모든 사용자에게 나눠주기 때문에,
// 사용자가 아무리 많아도 기상청에는 같은 곳을 30분에 한 번 정도만 물어봐요.

// 기상청 이용 규칙: 요청마다 앱 이름과 연락처(이메일이나 웹사이트 주소)를 밝혀야 해요.
// 저장소 이름을 gureummeong이 아닌 다른 이름으로 만들었다면 아래 주소도 같이 바꿔주세요.
const CONTACT = 'https://github.com/lgm500338/gureummeong';
const USER_AGENT = `gureummeong/2.0 (${CONTACT})`;

// 여행지 (앱의 index.html 안 SPOTS 목록과 이름표가 같아야 해요)
const SPOTS = {
  jeju: [33.36, 126.53], seoul: [37.55, 126.99], gwangju: [35.13, 126.99], busan: [35.16, 129.16],
  hokkaido: [43.06, 141.35], tokyo: [35.68, 139.77], taipei: [25.03, 121.56], halong: [20.91, 107.18],
  bangkok: [13.75, 100.5], bali: [-8.41, 115.19], boracay: [11.97, 121.92], rishikesh: [30.09, 78.27],
  gobi: [43.5, 104.0], dubai: [25.2, 55.27], istanbul: [41.01, 28.98], santorini: [36.39, 25.46],
  alps: [46.54, 7.96], paris: [48.86, 2.29], london: [51.51, -0.12], reykjavik: [64.15, -21.94],
  fjord: [62.1, 7.2], serengeti: [-2.33, 34.83], capetown: [-33.92, 18.42], rio: [-22.95, -43.21],
  patagonia: [-50.34, -72.26], machupicchu: [-13.16, -72.55], cancun: [21.16, -86.85],
  newyork: [40.78, -73.97], grandcanyon: [36.11, -112.11], banff: [51.18, -115.57],
  vancouver: [49.28, -123.12], honolulu: [21.28, -157.83], fiji: [-17.71, 178.07],
  sydney: [-33.86, 151.21], uluru: [-25.34, 131.04], queenstown: [-45.03, 168.66],
};

async function fetchPoint(lat, lon) {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat}&lon=${lon}`;
  const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!r.ok) throw new Error('met.no ' + r.status);
  const j = await r.json();
  const series = (j.properties && j.properties.timeseries) || [];
  const now = Date.now() - 30 * 60 * 1000;
  const entry = series.find((s) => new Date(s.time).getTime() >= now) || series[0];
  if (!entry) throw new Error('no data');
  const d = entry.data.instant.details;
  const n1 = entry.data.next_1_hours || {};
  const round = (v) => Math.round(v || 0);
  return {
    low: round(d.cloud_area_fraction_low),
    mid: round(d.cloud_area_fraction_medium),
    high: round(d.cloud_area_fraction_high),
    total: round(d.cloud_area_fraction),
    wind: Math.round((d.wind_speed || 0) * 10) / 10,
    windFrom: round(d.wind_from_direction),
    precip: (n1.details && n1.details.precipitation_amount) || 0,
    symbol: (n1.summary && n1.summary.symbol_code) || '',
  };
}

// 한꺼번에 너무 많이 묻지 않도록 여섯 곳씩 나눠서 물어봐요
async function inBatches(entries, size) {
  const out = [];
  for (let i = 0; i < entries.length; i += size) {
    const part = await Promise.all(entries.slice(i, i + size).map(async ([id, [lat, lon]]) => {
      try { return [id, await fetchPoint(lat, lon)]; } catch (e) { return [id, null]; }
    }));
    out.push(...part);
  }
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const q = req.query || {};
  if (q.lat !== undefined || q.lon !== undefined) {
    const lat = Number(q.lat), lon = Number(q.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) {
      res.status(400).json({ error: 'bad position' });
      return;
    }
    // 0.5도 단위로 묶어서 같은 곳은 같은 답을 나눠 써요
    const rlat = Math.round(lat * 2) / 2, rlon = Math.round(lon * 2) / 2;
    try {
      const w = await fetchPoint(rlat, rlon);
      res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
      res.status(200).json({ updated: new Date().toISOString(), point: w });
    } catch (e) {
      res.setHeader('Cache-Control', 's-maxage=60');
      res.status(502).json({ error: 'weather unavailable' });
    }
    return;
  }
  const entries = await inBatches(Object.entries(SPOTS), 6);
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  res.status(200).json({ updated: new Date().toISOString(), cities: Object.fromEntries(entries) });
};
