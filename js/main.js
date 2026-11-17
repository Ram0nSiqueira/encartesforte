const tab = document.getElementById("menuTab");
const menu = document.getElementById("menu");
const overlay = document.getElementById("overlay");
const closeBtn = document.getElementById("menuClose");

function setOpen(open) {
  menu.classList.toggle("open", open);
  menu.setAttribute("aria-hidden", String(!open));
  tab.setAttribute("aria-expanded", String(open));
  overlay.hidden = !open;
}

tab.addEventListener("click", () => setOpen(!menu.classList.contains("open")));
closeBtn.addEventListener("click", () => setOpen(false));
overlay.addEventListener("click", () => setOpen(false));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setOpen(false);
});
