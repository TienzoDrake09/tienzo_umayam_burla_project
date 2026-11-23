const ammoSwitches = document.querySelectorAll(".ammo-switch");

ammoSwitches.forEach((ammoSwitch) => {
    ammoSwitch.addEventListener("click", () => {
        ammoSwitches.forEach((otherSwitch) => {
            otherSwitch.setAttribute(
                "aria-pressed",
                String(otherSwitch === ammoSwitch),
            );
        });

    });
});