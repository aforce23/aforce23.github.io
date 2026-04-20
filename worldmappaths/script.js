// Initialize the map with CRS.Simple for flat images
const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -3,
    maxZoom: 2,
    zoomSnap: 0.5
});

// Custom global tooltip
const tooltipEl = document.getElementById('cursor-tooltip');
let isTooltipVisible = false;

document.addEventListener('mousemove', (e) => {
    if (isTooltipVisible) {
        tooltipEl.style.left = (e.pageX + 15) + 'px';
        tooltipEl.style.top = (e.pageY + 15) + 'px';
    }
});

function showTooltip(title, desc) {
    tooltipEl.innerHTML = `<h3>${title}</h3><p>${desc}</p>`;
    tooltipEl.style.display = 'block';
    tooltipEl.classList.add('show');
    isTooltipVisible = true;
}

function hideTooltip() {
    tooltipEl.style.display = 'none';
    tooltipEl.classList.remove('show');
    isTooltipVisible = false;
}

// Map dimensions and loading
const imgSrc = 'https://static.wikitide.net/criticalrolewiki/9/90/Wildemount_Poster_Map.jpg';
const img = new Image();
img.onload = function () {
    const w = this.naturalWidth;
    const h = this.naturalHeight;
    const bounds = [[0, 0], [h, w]];

    L.imageOverlay(imgSrc, bounds).addTo(map);
    map.fitBounds(bounds);

    // Once map limits are determined, fetch JSON paths
    loadPathsFromJson();
};
img.src = imgSrc;

// Array tracking all loaded or created paths for export
let allPaths = [];

// Global variable to track all path layer groups by category
const pathCategories = {};

// Fetch path configurations
async function loadPathsFromJson() {
    try {
        const response = await fetch('paths.json');
        if (response.ok) {
            const data = await response.json();
            data.forEach(pathData => {
                allPaths.push(pathData);
                drawPath(pathData.points, pathData.type, pathData.options, pathData.popupContent, pathData.group);
            });
            buildVisibilityMenu();
        } else {
            console.warn('paths.json not found. Proceeding with empty state.');
        }
    } catch (e) {
        console.warn('Failed to load paths.json. Are you running a local server?', e);
    }
}

// Catmull-Rom Spline Interpolator for smooth lines
function getCurvePoints(points, segments = 20) {
    if (points.length < 3) return points;
    let res = [];

    // Duplicate first and last points to clamp the spline to the edges
    let pts = [points[0], ...points, points[points.length - 1]];

    for (let i = 1; i < pts.length - 2; i++) {
        for (let t = 0; t <= 1; t += 1 / segments) {
            let p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2];
            let t2 = t * t;
            let t3 = t2 * t;

            let y = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
            let x = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);

            res.push([y, x]);
        }
    }
    return res;
}

// Renders a path onto the map
function drawPath(points, type, options, popupContent, groupName) {
    groupName = groupName || "Ungrouped";

    // Create a layer group specifically for this path's lines and markers
    const pathFeatureGroup = L.layerGroup();
    let layers = [];

    // Compute smoothed curve points for the visual lines and hitboxes
    const smoothPoints = getCurvePoints(points);

    const baseStyle = {
        color: options.color || '#ff0000',
        weight: options.weight || 4,
        opacity: options.opacity || 0.8,
        lineCap: 'round',
        lineJoin: 'round',
        className: ''
    };

    if (type === 'normal') {
        layers.push(L.polyline(smoothPoints, baseStyle).addTo(pathFeatureGroup));
    } else if (type === 'dashed') {
        const dashedStyle = { ...baseStyle, dashArray: '10, 10' };
        layers.push(L.polyline(smoothPoints, dashedStyle).addTo(pathFeatureGroup));
    } else if (type === 'dotted') {
        const dottedStyle = { ...baseStyle, dashArray: '1, 15', lineCap: 'round' };
        layers.push(L.polyline(smoothPoints, dottedStyle).addTo(pathFeatureGroup));
    } else if (type === 'bicolored') {
        const bottomColor = options.baseColor || '#000000';
        const topColor = options.topColor || '#ffffff';

        const bottomStyle = { ...baseStyle, color: bottomColor, weight: baseStyle.weight + 4 };
        const topStyle = { ...baseStyle, color: topColor, dashArray: '15, 15' };

        layers.push(L.polyline(smoothPoints, bottomStyle).addTo(pathFeatureGroup));
        layers.push(L.polyline(smoothPoints, topStyle).addTo(pathFeatureGroup));
    }

    // Place the start/end circles on the literal uncurved endpoints
    if (points.length > 0) {
        L.circleMarker(points[0], { radius: 7, color: '#2ecc71', weight: 2, fillColor: '#121212', fillOpacity: 1 }).addTo(pathFeatureGroup);
        L.circleMarker(points[points.length - 1], { radius: 7, color: '#e74c3c', weight: 2, fillColor: '#121212', fillOpacity: 1 }).addTo(pathFeatureGroup);
    }

    // Store original weights for correct hover interactions
    const originalWeights = layers.map(l => l.options.weight);

    layers.forEach((layer, idx) => {
        // Hitbox also follows the curve
        const hitboxStyle = { color: 'transparent', weight: 20, opacity: 0 };
        const hitbox = L.polyline(smoothPoints, hitboxStyle).addTo(pathFeatureGroup);

        hitbox.on('mouseover', () => {
            layers.forEach((l, lIndex) => {
                const el = l.getElement();
                if (el) el.classList.add('path-glow');
                l.setStyle({ opacity: 1, weight: originalWeights[lIndex] + 2 });
            });
            showTooltip(popupContent.title, popupContent.description);
        });

        hitbox.on('mouseout', () => {
            layers.forEach((l, lIndex) => {
                const el = l.getElement();
                if (el) el.classList.remove('path-glow');
                l.setStyle({ opacity: baseStyle.opacity, weight: originalWeights[lIndex] });
            });
            hideTooltip();
        });
    });

    // Add path to map immediately
    pathFeatureGroup.addTo(map);

    // Register path within categories for the visibility menu
    if (!pathCategories[groupName]) {
        pathCategories[groupName] = { groupLayer: L.layerGroup().addTo(map), paths: [] };
    }
    // Note: the individual pathFeatureGroup remains managed by us via map.addLayer / removeLayer directly,
    // or we could add it to the groupLayer. We will manage it via map for simplicity when toggling.
    pathCategories[groupName].paths.push({
        layer: pathFeatureGroup,
        title: popupContent.title,
        id: Math.random().toString(36).substr(2, 9)
    });
}

function buildVisibilityMenu() {
    const container = document.getElementById('visibility-controls');
    container.innerHTML = '';

    for (const [groupName, groupData] of Object.entries(pathCategories)) {
        const groupEl = document.createElement('div');
        groupEl.className = 'visibility-group';

        // Group Header
        const headerEl = document.createElement('label');
        headerEl.className = 'visibility-group-header';

        const groupCheckbox = document.createElement('input');
        groupCheckbox.type = 'checkbox';
        groupCheckbox.checked = true;

        const pathCheckboxes = [];

        groupCheckbox.addEventListener('change', (e) => {
            const isVisible = e.target.checked;
            groupData.paths.forEach(p => {
                if (isVisible) map.addLayer(p.layer);
                else map.removeLayer(p.layer);
            });
            pathCheckboxes.forEach(cb => cb.checked = isVisible);
        });

        headerEl.appendChild(groupCheckbox);
        headerEl.appendChild(document.createTextNode(groupName));
        groupEl.appendChild(headerEl);

        // Individual Paths
        const listEl = document.createElement('div');
        listEl.className = 'visibility-path-list';

        groupData.paths.forEach(p => {
            const itemEl = document.createElement('label');
            itemEl.className = 'visibility-path-item';

            const pCheckbox = document.createElement('input');
            pCheckbox.type = 'checkbox';
            pCheckbox.checked = true;
            pathCheckboxes.push(pCheckbox);

            pCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    map.addLayer(p.layer);
                    // Check group box if all paths are checked
                    if (pathCheckboxes.every(cb => cb.checked)) groupCheckbox.checked = true;
                } else {
                    map.removeLayer(p.layer);
                    groupCheckbox.checked = false;
                }
            });

            itemEl.appendChild(pCheckbox);
            itemEl.appendChild(document.createTextNode(p.title));
            listEl.appendChild(itemEl);
        });

        groupEl.appendChild(listEl);
        container.appendChild(groupEl);
    }
}

// -------------------------------------------------------------------
// Path Editor Logic
// -------------------------------------------------------------------
let isDrawing = false;
let editorPoints = [];
let tempPolyline = null;
let currentMarkers = [];

const btnToggle = document.getElementById('toggle-editor');
const btnClear = document.getElementById('clear-editor');
const editorDetails = document.getElementById('editor-details');
const btnSave = document.getElementById('save-drawn-path');
const btnExport = document.getElementById('export-json');

// Input fields
const inputTitle = document.getElementById('path-title');
const inputGroup = document.getElementById('path-group');
const inputDesc = document.getElementById('path-desc');
const inputType = document.getElementById('path-type');
const inputPrimaryColor = document.getElementById('path-color-1');
const inputSecondaryColor = document.getElementById('path-color-2');

btnToggle.addEventListener('click', () => {
    isDrawing = !isDrawing;
    if (isDrawing) {
        btnToggle.style.background = '#e67e22';
        btnToggle.innerText = 'Stop Drawing';
        map.getContainer().style.cursor = 'crosshair';
        editorDetails.style.display = 'block';
    } else {
        btnToggle.style.background = '#3498db';
        btnToggle.innerText = 'Start Drawing';
        map.getContainer().style.cursor = '';
    }
});

function clearEditor() {
    if (tempPolyline) { map.removeLayer(tempPolyline); tempPolyline = null; }
    currentMarkers.forEach(m => map.removeLayer(m));
    currentMarkers = [];
    editorPoints = [];
    inputTitle.value = '';
    inputDesc.value = '';
}

btnClear.addEventListener('click', clearEditor);

map.on('click', (e) => {
    if (!isDrawing) return;

    // Push precise points
    const pt = [Math.round(e.latlng.lat * 100) / 100, Math.round(e.latlng.lng * 100) / 100];
    editorPoints.push(pt);

    // Indicator node
    const marker = L.circleMarker(pt, { radius: 4, color: '#f1c40f', fillColor: '#121212', fillOpacity: 1 }).addTo(map);
    currentMarkers.push(marker);

    // Smooth line for the editor preview
    let previewPoints = getCurvePoints(editorPoints);
    if (tempPolyline) {
        tempPolyline.setLatLngs(previewPoints);
    } else {
        tempPolyline = L.polyline(previewPoints, { color: '#f1c40f', weight: 4, dashArray: '5,10' }).addTo(map);
    }
});

btnSave.addEventListener('click', () => {
    if (editorPoints.length < 2) {
        alert("Plot at least 2 points for a path first!");
        return;
    }

    const title = inputTitle.value || "Untitled Path";
    const groupName = inputGroup.value || "Ungrouped";
    const description = inputDesc.value || "No description provided.";
    const type = inputType.value;
    const color1 = inputPrimaryColor.value;
    const color2 = inputSecondaryColor.value;

    let options = { color: color1 };
    if (type === 'bicolored') {
        options = { baseColor: color1, topColor: color2, weight: 5 };
    }

    const newPath = {
        points: [...editorPoints],
        type: type,
        group: groupName,
        options: options,
        popupContent: { title, description }
    };

    // Store globally
    allPaths.push(newPath);

    // Draw the new path physically so the user sees it properly rendered
    drawPath(newPath.points, newPath.type, newPath.options, newPath.popupContent, newPath.group);

    // Rebuild visibility menu to include new path
    buildVisibilityMenu();

    // Reset editor
    clearEditor();

    // Revert Drawing Mode
    isDrawing = false;
    btnToggle.style.background = '#3498db';
    btnToggle.innerText = 'Start Drawing';
    map.getContainer().style.cursor = '';
    editorDetails.style.display = 'none';
    inputGroup.value = '';
});

btnExport.addEventListener('click', () => {
    const dataStr = JSON.stringify(allPaths, null, 4);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

    const exportFileDefaultName = 'paths.json';

    let linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
});

// UI Collapse Logic
const toggleVisBtn = document.getElementById('toggle-visibility');
const visPanel = document.getElementById('visibility-panel');
if (toggleVisBtn && visPanel) {
    toggleVisBtn.addEventListener('click', () => {
        visPanel.classList.toggle('collapsed');
        if (visPanel.classList.contains('collapsed')) {
            toggleVisBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';
            toggleVisBtn.title = 'Expand Visibility Menu';
        } else {
            toggleVisBtn.innerHTML = '<i class="fa-solid fa-minus"></i>';
            toggleVisBtn.title = 'Collapse Visibility Menu';
        }
    });
}

const toggleEditorBtn = document.getElementById('toggle-editor-panel');
const editorPanel = document.getElementById('editor-panel');
if (toggleEditorBtn && editorPanel) {
    toggleEditorBtn.addEventListener('click', () => {
        editorPanel.classList.toggle('collapsed');
        if (editorPanel.classList.contains('collapsed')) {
            toggleEditorBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
            toggleEditorBtn.title = 'Expand Editor';
        } else {
            toggleEditorBtn.innerHTML = '<i class="fa-solid fa-minus"></i>';
            toggleEditorBtn.title = 'Collapse Editor';
        }
    });
}
