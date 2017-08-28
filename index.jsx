"use strict";

// Base imports
import Options from './Options'
import { Mesh, Texture, Vector3, Object3D, PlaneBufferGeometry } from 'three'

// Used to correctly render the terrain model
import TerrainShaderMaterial from './TerrainShaderMaterial'

const LEFT   = 'LEFT';   // 1;
const RIGHT  = 'RIGHT';  // 2;
const TOP    = 'TOP';    // 3;
const BOTTOM = 'BOTTOM'; // 4;
const UPDATE_BOUNDING_SPHERES = 8 // Update bounding spheres every n frames to save CPU

class Terrain extends Object3D {
    constructor(options = {}) {

        // Call the THREEObject3D constructor
        super();

        // Adding default options
        options = {
            // Definitions to be passed to fragment & vertex shaders
            defines: {
                CLIP_EDGE:      0.5,    // Border clipping (Gives a smoother transition between tesselation levels)
                ELEVATION:      200,    // Maximum elevation
                TESSELATION:    32,     // Tesselation of a single node
                WORLD_SIZE_X:   32768,  // Total scale of our world space
                WORLD_SIZE_Y:   32768,  // Total scale of our world space
                VIEWPORT_SIZE:  32768,  // Size of our Node-window onto the terrain
                ...(options.defines || {}),  // Include user definitions
            },

            // Uniforms to be passed to fragment & vertex shaders
            uniforms: {
                texture:   options.texture || {},
                heightmap: options.heightmap || {},
                ...(options.uniforms || {}),  // Include user uniforms
            },

            // Material, will be built later from options.defines and options.uniforms,
            // but we can pass material specific options here also
            material: {
                depthTest: true,
                depthWrite: true,
                wireframe: false,
                transparent: false,
                ...(options.material || {}),  // Include user material
            },
            load:           options.load,
            nLevels:        options.nLevels || 3,      // Number of rings of nodes to generate

            // Descale height data for faster loading
            heightDataDescale: options.heightDataDescale || 1,

            // Send in progress loading functions
            onError:        options.onError     || ((errorMessage) => {}),
            onLoad:         options.onLoad      || ((terrainObject) => {}),
            onProgress:     options.onProgress  || ((name, itemsLoaded, itemsTotal) => {}),
            onStart:        options.onStart     || ((name, itemsLoaded, itemsTotal) => {}),
        };

        // Default to auto-loading the terrain without waiting for a specific Terrain.load call
        if (typeof options.load == 'undefined')
            options.load = true;

        // Check to see if the user has passed in a heightmap
        this.heightmap = false;
        if (options.uniforms.heightmap) {
            this.heightmap = options.uniforms.heightmap;
        }

        else if (options.material.uniforms && options.material.uniforms.heightmap) {
            this.heightmap = options.material.uniforms.heightmap;
        }

        if (! this.heightmap) {
            console.warn("You have not specified a heightmap texture, without this your terrain will be flat");
        }

        // Remove standard uniforms format if it's available
        // (We'll add it again later, this is to ensure uniform variable types throughout execution)
        if (options.material.uniforms.heightmap && options.material.uniforms.heightmap.type == 't') {
            options.material.uniforms.heightmap = options.material.heightmap.value;
        }
        // Same thing for the terrain texture
        if (options.material.uniforms.texture && options.material.uniforms.texture.type == 't') {
            options.material.uniforms.texture = options.material.texture.value;
        }

        // Should we generate the heightmap array?
        this.heightDataDescale = options.heightDataDescale;

        // Functions used to keep track of the loading process
        // Initialise these to receive callbacks
        this.onLoad     = options.onLoad;
        this.onError    = options.onError;
        this.onStart    = options.onStart;
        this.onProgress = options.onProgress;

        // Options used directly for terrain construction
        this.nLevels     = options.nLevels;

        // Save options to this terrain object
        this.material    = options.material;
        this.defines     = options.defines;
        this.uniforms    = options.uniforms;

        // debugging
        this.elevation    = this.defines.ELEVATION;
        this.viewportSize = this.defines.VIEWPORT_SIZE;
        this.worldSize    = Math.max(this.defines.WORLD_SIZE_X, this.defines.WORLD_SIZE_Y);

        // Specified a delayed loading?
        if (options.load)
            this.load();
    }

    load() {
        // Setup a plane geometry which will be scaled for each of our nodes
        this.renderShader = false;
        this.planeGeometry = new PlaneBufferGeometry(1, 1, this.defines.TESSELATION, this.defines.TESSELATION);
        this.planeGeometry.computeBoundingSphere();
        this.updateBoundingSpheres = UPDATE_BOUNDING_SPHERES;

        // Create the splay of nodes we'll use for this terrain mesh
        this.createSplay();

        // Save the heightmap data into an array for later queries
        this.initializeHeightmap()
        this.onLoad();
    }

    createSplay() {

        // Each level of detail here represents one node in a splay around the player
        // Looking something like this
        //
        //      X
        //    X X X
        //  X X P X X
        //    X X X
        //      X
        //
        // Where P is the player, and each X away from P is doubled in scale and halfed in tesselation
        //

        let x, y;
        let level = 0;
        let detailLevels = [];
        let currentScale = this.defines.VIEWPORT_SIZE / Math.pow(2, this.nLevels);

        // Which side we will use for edge-morphing:
        let UP = 1;
        let DN = 2;
        let LT = 4;
        let RT = 8;

        // x-y start position
        let xSt = 0;
        let ySt = 0;

        // Prepare to build a node from current parameters
        let addNode = (x, y, scale) => {
            let edge = 0;

            // Setting edge masks
            edge |= (x < xSt-scale) ? LT : (x > xSt ? RT : 0);
            edge |= (y < ySt-scale) ? DN : (y > ySt ? UP : 0);

            detailLevels.push({
                uniforms: {
                    nodeEdge: edge,
                    nodeScale: scale,
                    nodePosition: new Vector3(x + 0.5 * scale, y + 0.5 * scale)
                }
            });
        };

        let scale1 = currentScale;
        let scale2 = currentScale * 2;

        // Add central nodes
        addNode(xSt,          ySt,         scale1);
        addNode(xSt,          ySt-scale1,  scale1);
        addNode(xSt-scale1,   ySt-scale1,  scale1);
        addNode(xSt-scale1,   ySt,         scale1);

        while (++level <= this.nLevels) {

            scale1 = currentScale;
            scale2 = currentScale * 2;

            // Build up the surrounding tiles
            for (x = xSt-scale2, y = ySt-scale2; x < xSt+scale1; x += scale1) { addNode(x, y, scale1); }  // Bottom left to bottom right
            for (x = xSt+scale1, y = ySt-scale2; y < ySt+scale1; y += scale1) { addNode(x, y, scale1); }  // Bottom right to Top right
            for (x = xSt+scale1, y = ySt+scale1; x > xSt-scale2; x -= scale1) { addNode(x, y, scale1); }  // Top right to top left
            for (x = xSt-scale2, y = ySt+scale1; y > ySt-scale2; y -= scale1) { addNode(x, y, scale1); }  // Top left to Bottom left

            currentScale *= 2;
        }

        // Tell our caller that we're starting the load
        this.onStart('Terrain/CreateSplay', 0, detailLevels.length);

        // Building each node of the required quality
        let nodeId = 0;

        // We'll make a callback here, so as to give the loading scene time to render updates
        let loop = () => {
            if (nodeId < detailLevels.length) {
                this.createNode(detailLevels[nodeId]);

                // Incremental loading progress
                this.onProgress('Terrain/CreateNode', nodeId++, detailLevels.length);

                // Give the loader time to render
                return setTimeout(loop, 0);
            }
        }
        loop();
    };

    createRenderShader() {
        // Used to re-center the terrain, keeping areas of high detail near our viewing frustrum

        this.uniforms.nodeEdge = 0;
        this.uniforms.nodeScale = 1;
        this.uniforms.cPosition = this.position;
        this.uniforms.nodePosition = new Vector3(0,0,0);

        // Create our render shader
        this.renderShader = new TerrainShaderMaterial({
            ...this.material,
            defines: {
                ...this.material.defines,
                ...this.defines,
            },
            uniforms: {
                ...this.material.uniforms,
                ...this.uniforms,
            }
        });
    }

    /**
     * Node creation factory
     * Pass in options, get a single terrain node
     *
     * Terrain nodes are loosley bound together in the form of a splay
     * to create our spherical world.
     */
    createNode(node) {

        if (! this.renderShader) {
            this.createRenderShader();
        }
        node = {
            ...this.material,

            uniforms: {
                ...this.uniforms,
                ...this.material.uniforms,
                ...node.uniforms
            },
            defines: {
                ...this.defines,
                ...this.material.defines,
                ...node.defines
            },
        };
        let toReturn = new Mesh(this.planeGeometry, this.renderShader.clone(node));

        // Add a name for use with debugging tools (THREE.js inspector)
        toReturn.name = 'TerrainNode x:' + Math.floor(node.uniforms.nodePosition.x) + ' y:' + Math.floor(node.uniforms.nodePosition.y);
        toReturn.terrainNode = true;

        // Prevent frustrum culling of nodes which are close to the camera
        toReturn.frustumCulled = true;

        // Set the bounding sphere and the nodePosition for culling
        toReturn.position.copy(node.uniforms.nodePosition);
        toReturn.geometry.boundingSphere.radius = node.uniforms.nodeScale * .5;

        this.add(toReturn);
    }

    animate(offset) {
        this.position.x = offset.x / 2;
        this.position.y = offset.y / 2;

        // Only update the bounding spheres once every BOUNDING_SPHERE_UPDATE frames
        if (this.updateBoundingSpheres % UPDATE_BOUNDING_SPHERES == 0) {

            let nI = this.children.length;

            while (nI--) {
                if (this.children[nI].geometry && this.children[nI].geometry.boundingSphere && this.children[nI].terrainNode)
                    this.children[nI].geometry.boundingSphere.center.copy(this.position);
            }
            this.updateBoundingSpheres = 0;
        }

        this.updateBoundingSpheres++;
    }

    /**
     * Initialise the internal representation of our heightmap.
     * You will find this useful later when you want to get the elevation at specific coordinates
     */
    initializeHeightmap() {
        if (! this.heightmap) {
            throw "No heightmap data found!";
            return;
        }
        let heightmap, tempCanvas, tempContext, heightData;

        this.onStart('Terrain/CreateHeightmap', 0, 100);

        // Get the real location of the height information
        heightmap = this.heightmap.image; // .image || this.heightmap.texture || this.heightmap;

        // Create a temp canvas of the width and height, we'll write here to then retrieve the data
        tempCanvas = document.createElement('canvas');
        tempCanvas.width  = heightmap.width / this.heightDataDescale;
        tempCanvas.height = heightmap.height / this.heightDataDescale;

        this.onProgress('Terrain/CreateHeightmap', 25, 100);

        // draw the image onto the canvas
        tempContext = tempCanvas.getContext("2d");
        tempContext.drawImage(heightmap, 0, 0, tempCanvas.width, tempCanvas.height);

        this.onProgress('Terrain/CreateHeightmap', 50, 100);

        // copy the contents of the canvas
        this.heightData = tempContext.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

        // Extract the pixel data count (RGB or RGBA)
        this.heightData.rgb = (this.heightData.data.length / (this.heightData.width * this.heightData.height));
    }

    positionData(x, y) {
        // Initialize an empty return array for the position pixel-data
        let toReturn = new Uint8Array(this.heightData.rgb);

        // Make sure we don't try to read outside the heightmap texture
        if (x < 0 || y < 0 || x > this.defines.WORLD_SIZE_X || y > this.defines.WORLD_SIZE_Y) {
            return toReturn;
        }

        // First calculate the percentage world position, then normalize to heightdata texture coordinates
        let xPos = Math.floor((x / this.defines.WORLD_SIZE_X) * this.heightData.width);
        let yPos = Math.floor((1 - y / this.defines.WORLD_SIZE_Y) * this.heightData.height);

        // Get the next n {rgb} data values after the point
        let startPos = xPos * this.heightData.rgb + yPos * this.heightData.width * this.heightData.rgb;
        for (let i=0; i < this.heightData.rgb; i++) {
            toReturn[i] = this.heightData.data[startPos + i];
        }

        return toReturn;
    }

    getElevation(x, y) {
        return (this.positionData(x, y).slice(0,3).reduce((a,b) => a+b) / 765) * this.elevation;
    }

    dispose(ofTextures = true) {
        this.children.map(node => {
            node.geometry.dispose();
            node.material.dispose();
        });

        if (ofTextures) {
            let uniform;

            // Loop through the uniforms and check for textures to dispose of
            Object.keys(this.renderShader.uniforms).map(key => {
                uniform = this.renderShader.uniforms[key];

                // Check only for texture types
                if (uniform.type == 't') {
                    if (uniform.value instanceof Texture)
                        uniform.value.dispose();
                }
            })
        }

        this.renderShader.dispose();
        this.planeGeometry.dispose();
    }
};

export default Terrain;
