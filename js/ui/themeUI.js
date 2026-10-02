import { appState } from "../store/appState.js";
import { createContextLogger } from "../utils/logger.js";
import allTemasConfig from "../config/allTemasConfig.js";

const log = createContextLogger("ThemeUI");

export function initThemeUI() {
  // GENERAR BOTONES DE TEMA DINÁMICAMENTE
  function generateThemeButtons() {
    const themeButtonsGroup = document.getElementById("themeButtonsGroup");
    if (!themeButtonsGroup) return;

    const temasConfig = allTemasConfig;
    if (!temasConfig) return;

    themeButtonsGroup.innerHTML = "";
    const themeIcons = {
      agua: "water_drop",
      clima: "cloud",
      agricultura: "grass",
      mineria: "mining",
      otros: "more_horiz",
      planificacion: "map",
      riesgos: "warning",
      suelo: "landscape",
      energia: "bolt",
    };

    Object.keys(temasConfig).forEach(function (temaKey) {
      const temaConfig = temasConfig[temaKey];
      const temaNombre =
        temaConfig.nombre ||
        temaKey.charAt(0).toUpperCase() + temaKey.slice(1);
      const iconName = themeIcons[temaKey] || "layers";
      const themeBtn = document.createElement("button");
      themeBtn.className = "theme-btn sidebar-label";
      themeBtn.setAttribute("data-theme", temaKey);
      themeBtn.setAttribute("title", `Tema: ${temaNombre}`);
      themeBtn.innerHTML = `
        <span class="material-symbols-outlined">${iconName}</span>
        <span class="sidebar-label">${temaNombre}</span>
      `;
      if (appState.activeTemaName === temaKey) {
        themeBtn.classList.add("active");
      }
      themeButtonsGroup.appendChild(themeBtn);
    });

    log.log("Botones de tema generados:", Object.keys(temasConfig).length);
  }

  generateThemeButtons();

  // TEMA OSCURO/CLARO
  const themeToggle = document.getElementById("themeToggle");
  const htmlElement = document.documentElement;
  const savedTheme = localStorage.getItem("woll-theme") || "dark";
  htmlElement.setAttribute("data-theme", savedTheme);
  updateThemeIcon(savedTheme);

  function updateThemeIcon(theme) {
    if (!themeToggle) return;
    const iconSpan = themeToggle.querySelector("#themeIcon");
    if (iconSpan) {
      iconSpan.textContent = theme === "dark" ? "light_mode" : "dark_mode";
    }
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      const current = htmlElement.getAttribute("data-theme");
      const newTheme = current === "dark" ? "light" : "dark";
      htmlElement.setAttribute("data-theme", newTheme);
      localStorage.setItem("woll-theme", newTheme);
      updateThemeIcon(newTheme);
    });
  }
}