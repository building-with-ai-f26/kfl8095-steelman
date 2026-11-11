// PostHog analytics for the Product Page and the prototype (US cloud).
// The project key is a public, write-only key: it can send events but not read them, so it is safe in browser code.
// Local runs are tagged environment: "local" so they can be filtered out in PostHog.
//
// Consent follows common US practice: notice with opt-out. Analytics run unless the visitor turns them off (the first-visit
// notice, or Account in the prototype), and never when the browser sends Global Privacy Control or Do Not Track.
// The choice is kept in this browser (localStorage "steelman-analytics": "on" or "off"). See privacy.html.
(function () {
  var KEY = 'phc_owPKYJcMNdJe77EHnXj6qvwUVU5DHNcUsA4BW3Sxr7UF';
  var HOST = 'https://us.i.posthog.com';

  // PostHog's standard loader: queues calls until the library arrives from its assets host.
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog&&window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags on onFeatureFlags onSessionId identify setPersonProperties group resetGroups reset get_distinct_id get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException get_property opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  var STORE = 'steelman-analytics';
  var stored = function () { try { return localStorage.getItem(STORE); } catch (e) { return null; } };
  var signal = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';
  var on = !signal && stored() !== 'off';

  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === 'file:';
  posthog.init(KEY, {
    api_host: HOST,
    person_profiles: 'identified_only', // anonymous visitors only; nobody is identified
    respect_dnt: true,                  // browsers sending Do Not Track send nothing
    opt_out_capturing_by_default: !on,  // turned off here, or a privacy signal: nothing is sent
    capture_pageview: true,
    autocapture: true,
    disable_session_recording: !on      // session replay; typed text in inputs is masked by PostHog's defaults
  });
  if (!on) posthog.opt_out_capturing();

  // The prototype's Account card reads and changes the choice through this.
  window.steelmanAnalytics = {
    signal: signal,
    enabled: function () { return on; },
    set: function (value) {
      try { localStorage.setItem(STORE, value ? 'on' : 'off'); } catch (e) {}
      on = !!value && !signal;
      if (on) { posthog.opt_in_capturing(); posthog.startSessionRecording(); }
      else { posthog.stopSessionRecording(); posthog.opt_out_capturing(); }
      var notice = document.getElementById('sm-analytics-notice');
      if (notice) notice.remove();
    }
  };

  // First visit: a small notice, bottom left, until the visitor chooses. Not shown when a privacy signal already chose.
  function showNotice() {
    if (signal || stored() !== null || document.getElementById('sm-analytics-notice')) return;
    var privacy = /\/prototype\//.test(location.pathname) ? '../privacy.html' : 'privacy.html';
    var box = document.createElement('div');
    box.id = 'sm-analytics-notice';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Analytics');
    box.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483000;max-width:min(380px,calc(100vw - 32px));box-sizing:border-box;padding:14px 16px;border-radius:8px;background:#242424;color:#fff;font:400 13px/1.5 "Libre Franklin",system-ui,sans-serif;box-shadow:0 8px 24px rgb(0 0 0 / .2)';
    box.innerHTML = '<p style="margin:0 0 10px">Steelman records anonymous usage and screen replays to improve it. Typed text is hidden. <a href="' + privacy + '" style="color:#fff;text-underline-offset:3px">Privacy</a></p>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" data-choice="off" style="padding:6px 12px;border:1px solid #ffffff80;border-radius:6px;background:transparent;color:#fff;font:600 12px/1.2 inherit;cursor:pointer">Turn off</button>'
      + '<button type="button" data-choice="on" style="padding:6px 14px;border:0;border-radius:6px;background:#fff;color:#242424;font:600 12px/1.2 inherit;cursor:pointer">OK</button></div>';
    box.addEventListener('click', function (event) {
      var b = event.target.closest('button[data-choice]');
      if (b) window.steelmanAnalytics.set(b.getAttribute('data-choice') === 'on');
    });
    document.body.appendChild(box);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showNotice); else showNotice();

  posthog.register({ environment: local ? 'local' : 'production', page: location.pathname.indexOf('/prototype') >= 0 ? 'prototype' : 'product' });

  // The prototype runs in a frame whose own rules block network calls, so it posts events here and this page sends them.
  // Only messages from that frame, with a short event name and plain values, are accepted.
  window.addEventListener('message', function (event) {
    var frame = document.getElementById('codex-visualization');
    var data = event.data;
    if (!frame || event.source !== frame.contentWindow || !data || data.type !== 'steelman-analytics' || typeof data.event !== 'string') return;
    var props = {};
    if (data.props && typeof data.props === 'object') {
      Object.keys(data.props).slice(0, 12).forEach(function (k) {
        var v = data.props[k];
        if (typeof v === 'string') props[k] = v.slice(0, 80);
        else if (typeof v === 'number' || typeof v === 'boolean') props[k] = v;
      });
    }
    posthog.capture('prototype: ' + data.event.slice(0, 60), props);
  });
})();
