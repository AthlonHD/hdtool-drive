// 前端地图 JS API 的 key 与安全密钥(JS key 本就会暴露在浏览器里,请在高德控制台绑定域名白名单)
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ key: process.env.AMAP_JS_KEY || '', securityJsCode: process.env.AMAP_JS_SECRET || '' });
};
