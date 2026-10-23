/* LUMEA: nav, menu, scroll reveals and page arrival, shared by every page.
   Home page: the nav starts hidden (class "pre" in the markup) and drifts down a beat after the intro clouds
   part. js/stones.js fires "lumea:intro-done"; a timer covers the case where the 3D never starts. */
(() => {
  const html = document.documentElement;
  const nav = document.getElementById("nav"), btn = document.getElementById("menuBtn");
  const onScroll = () => nav.classList.toggle("solid", nav.classList.contains("open") || scrollY > 40);
  const setOpen = o => {
    nav.classList.toggle("open", o);
    btn.setAttribute("aria-expanded", o);
    btn.textContent = o ? "Close" : "Menu";
    html.classList.toggle("menu-open", o);
    onScroll();
  };
  btn.addEventListener("click", () => setOpen(!nav.classList.contains("open")));
  nav.querySelectorAll(".nav-links a").forEach(a => a.addEventListener("click", () => setOpen(false)));
  addEventListener("keydown", e => { if (e.key === "Escape" && nav.classList.contains("open")) { setOpen(false); btn.focus(); } });
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // the Sessions dropdown: opens on hover (CSS) and on click/tap
  document.querySelectorAll(".nav-drop-btn").forEach(b => {
    b.addEventListener("click", e => { e.stopPropagation(); const o = !b.parentElement.classList.contains("open"); b.parentElement.classList.toggle("open", o); b.setAttribute("aria-expanded", o); });
  });
  addEventListener("click", () => document.querySelectorAll(".nav-drop.open").forEach(d => { d.classList.remove("open"); d.querySelector("button").setAttribute("aria-expanded", "false"); }));

  // home: bring the bar in after the intro (or straight away for keyboard users who tab into it)
  if (nav.classList.contains("pre")) {
    let shown = false;
    const show = delay => { if (shown) return; shown = true; setTimeout(() => { nav.classList.add("arrive"); nav.classList.remove("pre"); }, delay); };
    addEventListener("lumea:intro-done", () => show(450));
    nav.addEventListener("focusin", () => show(0));
    setTimeout(() => show(0), matchMedia("(prefers-reduced-motion:reduce)").matches ? 0 : 6500);
  }

  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
  document.querySelectorAll(".rv").forEach(el => io.observe(el));

  // inner pages open from the same soft light the home page fades into when a stone is pressed
  requestAnimationFrame(() => requestAnimationFrame(() => html.classList.remove("arriving")));
  addEventListener("pageshow", () => html.classList.remove("leaving", "arriving"));
})();
