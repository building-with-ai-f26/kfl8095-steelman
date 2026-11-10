// PostHog analytics for the Product Page and the prototype (US cloud).
// The project key is a public, write-only key: it can send events but not read them, so it is safe in browser code.
// Local runs are tagged environment: "local" so they can be filtered out in PostHog.
(function () {
  var KEY = 'phc_owPKYJcMNdJe77EHnXj6qvwUVU5DHNcUsA4BW3Sxr7UF';
  var HOST = 'https://us.i.posthog.com';

  // PostHog's standard loader: queues calls until the library arrives from its assets host.
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog&&window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags on onFeatureFlags onSessionId identify setPersonProperties group resetGroups reset get_distinct_id get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException get_property opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === 'file:';
  posthog.init(KEY, {
    api_host: HOST,
    person_profiles: 'identified_only', // anonymous visitors only; nobody is identified
    respect_dnt: true,                  // browsers sending Do Not Track send nothing
    capture_pageview: true,
    autocapture: true,
    disable_session_recording: false    // session replay on; typed text in inputs is masked by PostHog's defaults
  });
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
