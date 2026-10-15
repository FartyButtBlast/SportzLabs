(() => {
  "use strict";
  const measurementId = "G-SB7B4GS83E";
  if (window.sportzLabsAnalyticsLoaded) return;
  window.sportzLabsAnalyticsLoaded = true;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () {
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", measurementId);

  const tag = document.createElement("script");
  tag.async = true;
  tag.src = "https://www.googletagmanager.com/gtag/js?id=" + measurementId;
  document.head.appendChild(tag);
})();
