// Who may call the API from a browser on another site.
//
// The public website sends its contact and booking-request forms to the CRM
// and reads the reply, so those two endpoints (and only those) accept the
// website's origin, without credentials. Everything else stays locked to the
// CRM's own address.
const WEBSITE_FORM_PATHS = /^\/api\/inquire\/(website|booking-request)$/;

function corsPolicy({ nodeEnv = process.env.NODE_ENV, baseUrl = process.env.BASE_URL, websiteOrigins = process.env.WEBSITE_ORIGINS } = {}) {
  const prod = nodeEnv === 'production';
  const crmOrigins = prod ? [baseUrl] : ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const siteOrigins = (websiteOrigins
    || 'https://www.rusticretreatalberta.ca,https://rusticretreatalberta.ca' +
       (prod ? '' : ',http://127.0.0.1:5174,http://localhost:5174,http://localhost:8080'))
    .split(',').map(o => o.trim()).filter(Boolean);
  return (req, cb) => {
    if (WEBSITE_FORM_PATHS.test(req.path) && siteOrigins.includes(req.header('Origin'))) {
      return cb(null, { origin: true, credentials: false, methods: ['POST'] });
    }
    cb(null, { origin: crmOrigins, credentials: true });
  };
}

module.exports = { corsPolicy };
