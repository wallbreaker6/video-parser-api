export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', message: 'Video Parser API' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: '缺少 url 参数' });
    }

    if (url.includes('douyin.com') || url.includes('v.douyin.com')) {
      const result = await parseDouyin(url);
      return res.status(200).json(result);
    }

    if (url.includes('bilibili.com') || url.includes('b23.tv')) {
      const result = await parseBilibili(url);
      return res.status(200).json(result);
    }

    return res.status(400).json({ error: '不支持的链接，请输入抖音或B站链接' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function parseDouyin(inputUrl) {
  let realUrl = inputUrl;
  if (inputUrl.includes('v.douyin.com') || inputUrl.includes('vm.tiktok.com')) {
    try {
      const resp = await fetch(inputUrl, { redirect: 'follow' });
      realUrl = resp.url;
    } catch (e) {}
  }

  let awemeId = null;
  let m = realUrl.match(/video[/](\d{15,})/);
  if (m) awemeId = m[1];
  if (!awemeId) {
    m = realUrl.match(/note[/](\d{15,})/);
    if (m) awemeId = m[1];
  }
  if (!awemeId) {
    m = realUrl.match(/aweme_id=(\d{15,})/);
    if (m) awemeId = m[1];
  }
  if (!awemeId) throw new Error('无法提取视频ID');

  const shareUrl = 'https://www.iesdouyin.com/share/video/' + awemeId + '/';
  const resp = await fetch(shareUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    },
  });
  const html = await resp.text();

  const vm = html.match(/"play_addr"\s*:\s*\{[^}]*?"url_list"\s*:\s*\["([^"]+)"/);
  if (vm) {
    let videoUrl = vm[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
    videoUrl = videoUrl.replace(/\/playwm\//g, '/play/').replace(/playwm/g, 'play');
    const am = html.match(/"nickname"\s*:\s*"([^"]+)"/);
    return {
      title: '抖音视频',
      author: am ? am[1] : '未知',
      cover: '',
      videoUrl: videoUrl,
      platform: '抖音',
      duration: 0,
    };
  }
  throw new Error('抖音视频解析失败');
}

async function parseBilibili(inputUrl) {
  let realUrl = inputUrl;
  if (inputUrl.includes('b23.tv')) {
    try {
      const resp = await fetch(inputUrl, { redirect: 'follow' });
      realUrl = resp.url;
    } catch (e) {}
  }

  const bvMatch = realUrl.match(/(BV[a-zA-Z0-9]+)/);
  if (!bvMatch) throw new Error('无法提取 BV 号');
  const bvid = bvMatch[1];

  const infoResp = await fetch('https://api.bilibili.com/x/web-interface/view?bvid=' + bvid, {
    headers: {
      'Referer': 'https://www.bilibili.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  const infoData = await infoResp.json();
  if (!infoData.data) throw new Error('B站 API 返回数据为空');

  const cid = infoData.data.cid;
  const videoResp = await fetch('https://api.bilibili.com/x/player/playurl?bvid=' + bvid + '&cid=' + cid + '&qn=80&fnval=1', {
    headers: {
      'Referer': 'https://www.bilibili.com/video/' + bvid,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  const videoData = await videoResp.json();

  let videoUrl = '';
  if (videoData.data && videoData.data.durl && videoData.data.durl.length > 0) {
    videoUrl = videoData.data.durl[0].url || '';
  }
  if (!videoUrl) throw new Error('获取视频地址失败');

  return {
    title: infoData.data.title || 'B站视频',
    author: infoData.data.owner ? infoData.data.owner.name : '未知',
    cover: infoData.data.pic || '',
    videoUrl: videoUrl,
    platform: 'B站',
    duration: infoData.data.duration || 0,
  };
}
