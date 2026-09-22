/*
  The Kitchen Guardian page asks the AI helper through window.claude.use("sample").
  That interface is normally provided by the Claude app. On your own server it
  does not exist, so this small file provides the same interface and sends each
  request to /api/ask on this server instead. The page code stays unchanged.
*/
(function () {
  if (window.claude) return;
  var MAX_SIDE = 1600;

  function fail(code, message, text) {
    var e = { code: code, message: message || code };
    if (text) e.text = text;
    return e;
  }

  // Shrink phone photos before upload: faster, and well under the API size limit.
  function fileToJpeg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var s = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(fail('image_rejected', 'Could not read the image.'));
      };
      img.src = url;
    });
  }

  function parseJson(text) {
    try { return JSON.parse(text); } catch (e) {}
    var fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
    if (fence) { try { return JSON.parse(fence[1]); } catch (e) {} }
    var a = text.search(/[\[{]/);
    var b = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'));
    if (a > -1 && b > a) return JSON.parse(text.slice(a, b + 1));
    throw new Error('no json');
  }

  async function ask(input, opts, asJson) {
    opts = opts || {};
    var prompt = typeof input === 'string' ? input : input.map(function (m) { return m.content; }).join('\n\n');
    var image = null;
    var f = opts.images;
    if (f && f.length !== undefined && !(f instanceof Blob)) f = f[0];
    if (f) image = await fileToJpeg(f);

    var res;
    try {
      res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt, image: image, json: !!asJson }),
        signal: opts.signal
      });
    } catch (e) {
      if (e && e.name === 'AbortError') throw fail('cancelled', 'Cancelled');
      throw fail('upstream_error', 'Could not reach the server.');
    }
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw fail(data.code || 'upstream_error', data.message || 'HTTP ' + res.status);
    if (opts.onText) opts.onText({ text: data.text, delta: data.text });
    return data;
  }

  var sample = async function (input, opts) {
    var d = await ask(input, opts, false);
    return { text: d.text, truncated: !!d.truncated, modelTierApplied: 'default' };
  };
  sample.json = async function (input, opts) {
    var d = await ask(input, opts, true);
    try { return parseJson(d.text); } catch (e) { throw fail('invalid_json', 'The reply was not valid JSON.', d.text); }
  };
  sample.limits = async function () {
    return { maxPromptBytes: 20000, images: { maxCount: 1, maxInputBytes: 20000000, mediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] } };
  };

  var ready = fetch('/api/health').then(function (r) { return r.json(); }).then(function (h) { return !!h.ai; }).catch(function () { return false; });
  window.claude = {
    use: async function (name) {
      if (name === 'sample') return (await ready) ? sample : null;
      return null; // no shared database here: the page falls back to this browser's storage
    }
  };
})();
