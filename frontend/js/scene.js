/**
 * Three.js Scene Manager for F1 Sculpture Rendering
 * Handles 3D scene setup, sculpture rendering, and camera controls
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getTeamColors } from './team-colors.js';

class SceneManager {
    constructor(containerId) {
        this.containerId = containerId;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.sculptureGroup = null;
        this.animationId = null;

        // Track individual sculptures for removal and interaction
        this.sculptures = new Map(); // driverCode -> {mesh, label, data}
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.tooltip = null;

        this.init();
        this.setupInteraction();
    }

    /**
     * Initialize Three.js scene
     */
    init() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error(`Container ${this.containerId} not found`);
            return;
        }

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0a);
        this.scene.fog = new THREE.Fog(0x0a0a0a, 200, 500);

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            60,
            container.clientWidth / container.clientHeight,
            0.1,
            1000
        );
        this.camera.position.set(150, 100, 150);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(this.renderer.domElement);

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxDistance = 400;
        this.controls.minDistance = 50;

        // Lights
        this.setupLights();

        // Grid helper
        const gridHelper = new THREE.GridHelper(400, 40, 0x333333, 0x1a1a1a);
        this.scene.add(gridHelper);

        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize());

        // Start animation loop
        this.animate();

        console.log('Three.js scene initialized');
    }

    /**
     * Setup scene lighting
     */
    setupLights() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x404040, 2);
        this.scene.add(ambientLight);

        // Main directional light
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(100, 100, 50);
        this.scene.add(directionalLight);

        // Accent back light (theme color)
        const backLight = new THREE.DirectionalLight(0xe94560, 0.5);
        backLight.position.set(-100, 50, -50);
        this.scene.add(backLight);
    }

    /**
     * Setup interaction (raycasting for clicking ribbons)
     */
    setupInteraction() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        // Click event for G-force tooltip
        container.addEventListener('click', (event) => this.onCanvasClick(event));

        // ESC key to close tooltip
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.tooltip) {
                this.hideTooltip();
            }
        });
    }

    /**
     * Handle canvas click for G-force data
     */
    onCanvasClick(event) {
        const canvas = this.renderer.domElement;
        const rect = canvas.getBoundingClientRect();

        // Calculate mouse position in normalized device coordinates (-1 to +1)
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // Update raycaster
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Check for intersections with sculpture meshes
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        for (const intersect of intersects) {
            // Only process mesh objects with sculpture data
            if (intersect.object.isMesh && intersect.object.userData.sculptureData) {
                const sculptureData = intersect.object.userData.sculptureData;
                const vertices = sculptureData.vertices;

                // Find nearest vertex to intersection point
                let nearestVertex = null;
                let minDistance = Infinity;

                for (const vertex of vertices) {
                    const vertexPos = new THREE.Vector3(
                        vertex.x + (intersect.object.userData.xOffset || 0),
                        vertex.y,
                        vertex.z
                    );
                    const distance = intersect.point.distanceTo(vertexPos);

                    if (distance < minDistance) {
                        minDistance = distance;
                        nearestVertex = vertex;
                    }
                }

                if (nearestVertex) {
                    this.showGForceTooltip(nearestVertex, event.clientX, event.clientY, sculptureData.driver);
                }
                return;
            }
        }

        // Click outside sculpture - hide tooltip
        this.hideTooltip();
    }

    /**
     * Show G-force data tooltip
     */
    showGForceTooltip(vertex, x, y, driver) {
        // Remove existing tooltip
        this.hideTooltip();

        // Create tooltip element
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'gforce-tooltip';

        const driverName = driver ? driver.abbreviation : 'Driver';

        this.tooltip.innerHTML = `
            <div class="gforce-tooltip-header">
                ${driverName} - Telemetry Data
                <button class="gforce-tooltip-close-btn" onclick="window.sceneManager.hideTooltip()">×</button>
            </div>
            <div class="gforce-tooltip-row">
                <span class="gforce-tooltip-label">G-Force:</span>
                <span class="gforce-tooltip-value">${vertex.gForce?.toFixed(2) || 'N/A'}G</span>
            </div>
            <div class="gforce-tooltip-row">
                <span class="gforce-tooltip-label">Longitudinal G:</span>
                <span class="gforce-tooltip-value">${vertex.longG?.toFixed(2) || 'N/A'}G</span>
            </div>
            <div class="gforce-tooltip-row">
                <span class="gforce-tooltip-label">Lateral G:</span>
                <span class="gforce-tooltip-value">${vertex.latG?.toFixed(2) || 'N/A'}G</span>
            </div>
            <div class="gforce-tooltip-row">
                <span class="gforce-tooltip-label">Speed:</span>
                <span class="gforce-tooltip-value">${vertex.speed?.toFixed(0) || 'N/A'} km/h</span>
            </div>
            <div class="gforce-tooltip-row">
                <span class="gforce-tooltip-label">Distance:</span>
                <span class="gforce-tooltip-value">${vertex.distance?.toFixed(0) || 'N/A'}m</span>
            </div>
            <div class="gforce-tooltip-hint">Click anywhere or press ESC to close</div>
        `;

        // Position tooltip near click (with offset to avoid cursor)
        this.tooltip.style.left = `${x + 15}px`;
        this.tooltip.style.top = `${y + 15}px`;

        // Add to DOM
        document.body.appendChild(this.tooltip);

        console.log('Showing tooltip for vertex:', vertex);
    }

    /**
     * Hide G-force tooltip
     */
    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.remove();
            this.tooltip = null;
        }
    }

    /**
     * Build sculpture from telemetry data
     */
    buildSculpture(sculptureData) {
        console.log('Building sculpture with', sculptureData.vertices.length, 'vertices');

        // Remove existing sculpture
        if (this.sculptureGroup) {
            this.scene.remove(this.sculptureGroup);
            this.disposeSculpture();
        }

        this.sculptureGroup = new THREE.Group();

        const vertices = sculptureData.vertices;
        const colors = sculptureData.colors;

        // Create tube geometry along the path
        const path = new THREE.CurvePath();

        for (let i = 0; i < vertices.length - 1; i++) {
            const v1 = new THREE.Vector3(vertices[i].x, vertices[i].y, vertices[i].z);
            const v2 = new THREE.Vector3(vertices[i + 1].x, vertices[i + 1].y, vertices[i + 1].z);
            path.add(new THREE.LineCurve3(v1, v2));
        }

        // Create tube
        const tubeGeometry = new THREE.TubeGeometry(path, vertices.length, 1, 8, false);

        // Create color attribute for tube
        const tubeColors = new Float32Array(tubeGeometry.attributes.position.count * 3);
        const posCount = tubeGeometry.attributes.position.count;
        const segmentCount = vertices.length;

        for (let i = 0; i < posCount; i++) {
            const segmentIndex = Math.floor((i / posCount) * segmentCount);
            const color = colors[Math.min(segmentIndex, colors.length - 1)];
            tubeColors[i * 3] = color.r;
            tubeColors[i * 3 + 1] = color.g;
            tubeColors[i * 3 + 2] = color.b;
        }

        tubeGeometry.setAttribute('color', new THREE.BufferAttribute(tubeColors, 3));

        // Material with vertex colors
        const material = new THREE.MeshPhongMaterial({
            vertexColors: true,
            shininess: 60,
            emissive: 0x111111
        });

        const mesh = new THREE.Mesh(tubeGeometry, material);

        // Attach sculpture data for raycasting
        mesh.userData.sculptureData = sculptureData;
        mesh.userData.xOffset = 0;

        this.sculptureGroup.add(mesh);

        // Add ground shadow (flat projection)
        const shadowGeometry = new THREE.BufferGeometry();
        const shadowPositions = [];

        for (let i = 0; i < vertices.length; i++) {
            shadowPositions.push(vertices[i].x, 0, vertices[i].y);
        }

        shadowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(shadowPositions, 3));

        const shadowMaterial = new THREE.LineBasicMaterial({
            color: 0x333333,
            transparent: true,
            opacity: 0.3
        });

        const shadowLine = new THREE.Line(shadowGeometry, shadowMaterial);
        this.sculptureGroup.add(shadowLine);

        this.scene.add(this.sculptureGroup);

        console.log('Sculpture built successfully');
    }

    /**
     * Build multiple sculptures for comparison mode
     */
    buildMultipleSculptures(sculptures) {
        console.log('Building', sculptures.length, 'sculptures for comparison');

        // Remove existing
        if (this.sculptureGroup) {
            this.scene.remove(this.sculptureGroup);
            this.disposeSculpture();
        }

        this.sculptureGroup = new THREE.Group();
        this.sculptures.clear(); // Clear tracking map

        // Calculate spacing
        const spacing = 150; // Distance between sculptures
        const totalWidth = (sculptures.length - 1) * spacing;
        const startX = -totalWidth / 2;

        sculptures.forEach((sculptureData, index) => {
            const xOffset = startX + (index * spacing);

            // Build individual sculpture with offset and team color
            const teamName = sculptureData.driver.teamName;
            const driverCode = sculptureData.driver.abbreviation;
            const sculptureMesh = this.buildSingleSculptureMesh(sculptureData, xOffset, teamName);
            this.sculptureGroup.add(sculptureMesh);

            // Add driver label with team color
            const label = this.addSculptureLabel(
                driverCode,
                xOffset,
                sculptureData.vertices,
                teamName
            );

            // Track sculpture for removal
            this.sculptures.set(driverCode, {
                mesh: sculptureMesh,
                label: label,
                data: sculptureData,
                xOffset: xOffset
            });
        });

        this.scene.add(this.sculptureGroup);

        console.log('Multiple sculptures built successfully');
    }

    /**
     * Build a single sculpture mesh with offset (helper for comparison mode)
     */
    buildSingleSculptureMesh(sculptureData, xOffset = 0, teamName = null) {
        const group = new THREE.Group();

        const vertices = sculptureData.vertices;

        // Create tube geometry along the path
        const path = new THREE.CurvePath();

        for (let i = 0; i < vertices.length - 1; i++) {
            const v1 = new THREE.Vector3(
                vertices[i].x + xOffset,
                vertices[i].y,
                vertices[i].z
            );
            const v2 = new THREE.Vector3(
                vertices[i + 1].x + xOffset,
                vertices[i + 1].y,
                vertices[i + 1].z
            );
            path.add(new THREE.LineCurve3(v1, v2));
        }

        // Create tube
        const tubeGeometry = new THREE.TubeGeometry(path, vertices.length, 1, 8, false);

        // Apply colors with G-force intensity
        const colors = sculptureData.colors;
        const tubeColors = new Float32Array(tubeGeometry.attributes.position.count * 3);
        const posCount = tubeGeometry.attributes.position.count;
        const segmentCount = vertices.length;

        if (teamName) {
            // Comparison mode: blend team color with G-force intensity
            const teamColors = getTeamColors(teamName);
            const teamColor = new THREE.Color(teamColors.primary);
            const highGColor = new THREE.Color(0xff3333); // Red for high G

            for (let i = 0; i < posCount; i++) {
                const segmentIndex = Math.floor((i / posCount) * segmentCount);
                const gForceColor = colors[Math.min(segmentIndex, colors.length - 1)];

                // Calculate G-force intensity (0 = low, 1 = high)
                // Green (low G) to Red (high G) in original gradient
                const gIntensity = gForceColor.r; // Red channel indicates intensity

                // Blend team color with high-G color based on intensity
                const blendedColor = new THREE.Color();
                blendedColor.r = teamColor.r * (1 - gIntensity * 0.7) + highGColor.r * (gIntensity * 0.7);
                blendedColor.g = teamColor.g * (1 - gIntensity * 0.7) + highGColor.g * (gIntensity * 0.7);
                blendedColor.b = teamColor.b * (1 - gIntensity * 0.7) + highGColor.b * (gIntensity * 0.7);

                tubeColors[i * 3] = blendedColor.r;
                tubeColors[i * 3 + 1] = blendedColor.g;
                tubeColors[i * 3 + 2] = blendedColor.b;
            }
        } else {
            // Single mode: use original G-force gradient
            for (let i = 0; i < posCount; i++) {
                const segmentIndex = Math.floor((i / posCount) * segmentCount);
                const color = colors[Math.min(segmentIndex, colors.length - 1)];
                tubeColors[i * 3] = color.r;
                tubeColors[i * 3 + 1] = color.g;
                tubeColors[i * 3 + 2] = color.b;
            }
        }

        tubeGeometry.setAttribute('color', new THREE.BufferAttribute(tubeColors, 3));

        const material = new THREE.MeshPhongMaterial({
            vertexColors: true,
            shininess: 60,
            emissive: 0x111111
        });

        const mesh = new THREE.Mesh(tubeGeometry, material);

        // Attach sculpture data for raycasting
        mesh.userData.sculptureData = sculptureData;
        mesh.userData.xOffset = xOffset;

        group.add(mesh);

        // Add ground shadow
        const shadowGeometry = new THREE.BufferGeometry();
        const shadowPositions = [];

        for (let i = 0; i < vertices.length; i++) {
            shadowPositions.push(vertices[i].x + xOffset, 0, vertices[i].y);
        }

        shadowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(shadowPositions, 3));

        const shadowMaterial = new THREE.LineBasicMaterial({
            color: 0x333333,
            transparent: true,
            opacity: 0.3
        });

        const shadowLine = new THREE.Line(shadowGeometry, shadowMaterial);
        group.add(shadowLine);

        return group;
    }

    /**
     * Add HTML label for sculpture
     */
    addSculptureLabel(driverCode, xOffset, vertices, teamName = null) {
        // Create HTML overlay label container if it doesn't exist
        let labelContainer = document.getElementById('sculpture-labels');
        if (!labelContainer) {
            labelContainer = document.createElement('div');
            labelContainer.id = 'sculpture-labels';
            labelContainer.className = 'sculpture-labels';
            const canvasContainer = document.getElementById(this.containerId);
            if (canvasContainer) {
                canvasContainer.appendChild(labelContainer);
            }
        }

        // Find highest Y position in vertices for label placement
        const maxY = Math.max(...vertices.map(v => v.z));

        // Create label element
        const label = document.createElement('div');
        label.className = 'sculpture-label';
        label.dataset.xOffset = xOffset;
        label.dataset.yOffset = maxY + 20;
        label.dataset.driverCode = driverCode;

        // Create text span
        const textSpan = document.createElement('span');
        textSpan.className = 'sculpture-label-text';
        textSpan.textContent = driverCode;

        // Create close button
        const closeButton = document.createElement('button');
        closeButton.className = 'sculpture-label-close';
        closeButton.innerHTML = '×';
        closeButton.title = 'Remove sculpture';
        closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeSculpture(driverCode);
        });

        label.appendChild(textSpan);
        label.appendChild(closeButton);

        // Apply team color to label if in comparison mode
        if (teamName) {
            const teamColors = getTeamColors(teamName);
            label.style.color = teamColors.primary;
            label.style.borderColor = teamColors.primary;
        }

        labelContainer.appendChild(label);

        // Update label positions
        this.updateLabelPositions();

        return label;
    }

    /**
     * Update label positions based on camera view
     */
    updateLabelPositions() {
        const labelContainer = document.getElementById('sculpture-labels');
        if (!labelContainer) return;

        const labels = labelContainer.querySelectorAll('.sculpture-label');

        labels.forEach(label => {
            const xOffset = parseFloat(label.dataset.xOffset);
            const yOffset = parseFloat(label.dataset.yOffset);

            // Project 3D position to 2D screen coordinates
            const vector = new THREE.Vector3(xOffset, yOffset, 0);
            vector.project(this.camera);

            // Convert to screen coordinates
            const canvas = this.renderer.domElement;
            const x = (vector.x * 0.5 + 0.5) * canvas.clientWidth;
            const y = (-vector.y * 0.5 + 0.5) * canvas.clientHeight;

            // Position label
            label.style.left = `${x}px`;
            label.style.top = `${y}px`;
        });
    }

    /**
     * Dispose of current sculpture to free memory
     */
    disposeSculpture() {
        if (!this.sculptureGroup) return;

        // Dispose all geometry and materials
        this.sculptureGroup.traverse((object) => {
            if (object.geometry) {
                object.geometry.dispose();
            }
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => material.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });

        // Remove from scene BEFORE setting to null
        this.scene.remove(this.sculptureGroup);

        this.sculptureGroup = null;
        this.sculptures.clear();

        // Clear HTML labels
        const labelContainer = document.getElementById('sculpture-labels');
        if (labelContainer) {
            labelContainer.innerHTML = '';
        }

        // Close any open tooltips
        this.hideTooltip();

        console.log('All sculptures removed from scene');
    }

    /**
     * Remove a single sculpture by driver code
     */
    removeSculpture(driverCode) {
        console.log('Removing sculpture for driver:', driverCode);

        const sculpture = this.sculptures.get(driverCode);
        if (!sculpture) {
            console.warn('Sculpture not found for driver:', driverCode);
            return;
        }

        // Remove mesh from scene
        if (this.sculptureGroup && sculpture.mesh) {
            this.sculptureGroup.remove(sculpture.mesh);

            // Dispose geometry and materials
            sculpture.mesh.traverse((object) => {
                if (object.geometry) {
                    object.geometry.dispose();
                }
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            });
        }

        // Remove label from DOM
        if (sculpture.label) {
            sculpture.label.remove();
        }

        // Remove from tracking map
        this.sculptures.delete(driverCode);

        // Notify main app to update stats panel and driver selection
        if (window.f1App) {
            window.f1App.onSculptureRemoved(driverCode);
        }

        console.log(`Sculpture removed. ${this.sculptures.size} sculptures remaining.`);
    }

    /**
     * Reset camera to default position
     */
    resetCamera() {
        this.camera.position.set(150, 100, 150);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }

    /**
     * Handle window resize
     */
    onWindowResize() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        this.camera.aspect = container.clientWidth / container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(container.clientWidth, container.clientHeight);
    }

    /**
     * Animation loop
     */
    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());
        this.controls.update();

        // Update label positions if in comparison mode
        this.updateLabelPositions();

        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Clean up and dispose resources
     */
    dispose() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }

        this.disposeSculpture();

        if (this.renderer) {
            this.renderer.dispose();
        }

        if (this.controls) {
            this.controls.dispose();
        }
    }
}

export default SceneManager;
