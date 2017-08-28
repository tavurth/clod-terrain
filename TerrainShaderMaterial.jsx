"use strict";

import { ShaderMaterial } from 'three'

let rand = `
float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}
`;

let getUv = `
/**
 * Returns the UV coordinates of the current vertex position
 * vec3 p => The translated position of the current vertex
 */
vec2 getUv(vec3 p) {

    float u = (nodePosition.x + p.x) / WORLD_SIZE_X;
    float v = (nodePosition.y + p.y) / WORLD_SIZE_Y;

    return vec2(u, v);
}
`;

let getElevation = `

/**
 *  Returns the height at our current vertex position
 *
 *  sampler2D sample => The texture from which to sample height data
 *  vec3 p           => The translated position of the current vertex
 */

#define aDeltaE 0.99
#define bDeltaE 1.01

float getElevation(sampler2D sample, vec3 p) {
    vec2 uv = getUv(p);
    vec4 d = texture2D(sample, uv);
    return ((d.x + d.y + d.z) / 3.0) * ELEVATION;
}

float getElevation(sampler2D sample, vec3 p, bool multisample) {
    vec2 uv = getUv(p);
    vec4 d = texture2D(sample, uv);
    d = mix(d, texture2D(sample, vec2(uv.x * aDeltaE, uv.y * aDeltaE)), uv.y);
    d = mix(d, texture2D(sample, vec2(uv.x * bDeltaE, uv.y * aDeltaE)), uv.y);
    d = mix(d, texture2D(sample, vec2(uv.x * bDeltaE, uv.y * bDeltaE)), uv.x);
    d = mix(d, texture2D(sample, vec2(uv.x * aDeltaE, uv.y * bDeltaE)), uv.x);
    return ((d.x + d.y + d.z) / 3.0) * ELEVATION;
}
`;

let getPosition = `
/**
 * Translates the current vertex coordinates into our terrain space
 * vec3 cPosition => Current camera position
 *                   This is required to keep the detail center at the camera coordinates
 *                   and as we will mutate the mesh, to keep the terrain from flickering
 */
vec3 getPosition(vec3 cPosition) {
    vec3 vPosition = position;

    // Scale by the size of this node
    vPosition *= nodeScale;

    // Translate by camera coordinates
    vPosition += cPosition;
    // vPosition += nodePosition;

    vPosition.z = 0.;

    return vPosition;
}
`;

let clipSides = `
/**
 * Returns true or false if the current nodeEdge matches the passed edge bitmask
 *
 * int edge => Bitmask edge to be checked against current nodeEdge
 */
bool clipSideMatches(int edge) {
    int e = nodeEdge / edge;
    return 2 * ( e / 2 ) != e;
}

#define CLIP_UP 1
#define CLIP_DN 2
#define CLIP_LT 4
#define CLIP_RT 8

/**
 * Returns a flaoting point value of the distance of
 * the current vertex from the edge of the current NODE mesh
 * vec2 p => UV coordinates of the current vertex
 */
float getClip(vec2 p) {
    float clip;
    float toReturn = 0.0;

    if (clipSideMatches(CLIP_RT) && p.x >= 1. - CLIP_EDGE) {
        clip     = 1.0 - clamp((1.0 - p.x) / CLIP_EDGE, 0.0, 1.0);
        toReturn = max(clip, toReturn);
    }
    if (clipSideMatches(CLIP_UP) && p.y >= 1. - CLIP_EDGE) {
        clip     = 1.0 - clamp((1.0 - p.y) / CLIP_EDGE, 0.0, 1.0);
        toReturn = max(clip, toReturn);
    }
    if (clipSideMatches(CLIP_LT) && p.x <= CLIP_EDGE) {
        clip     = 1.0 - clamp(p.x / CLIP_EDGE, 0.0, 1.0);
        toReturn = max(clip, toReturn);
    }
    if (clipSideMatches(CLIP_DN) && p.y <= CLIP_EDGE) {
        clip     = 1.0 - clamp(p.y / CLIP_EDGE, 0.0, 1.0);
        toReturn = max(clip, toReturn);
    }

    return toReturn;
}

/**
 * Returns a correct clipped position of a vertex
 * This is required because we will mutate vertices at the edge of each NODE to align
 * with a lower detail NODE's tesselation level
 *
 * vec3 p => Current translated vertex coordinates
 */
vec3 clipSides(vec3 p) {
    _vClipFactor = getClip(uv);

    float grid = nodeScale / TESSELATION;
    p = floor(p / grid) * grid;

    // We're not currently close to an nodeEdge
    // nodeEdges are defined by a doubling of nodeScale for the same nodeTesselation
    if (_vClipFactor <= 0.01) {
        return p;
    }

    // Debugging
    // Lower the resolution of the grid, as we're moving to a
    // larger node from a smaller node
    grid *= 2.;
    vec3 p2 = floor(p / grid) * grid;

    // Linearly interpolate the low-poly and high-poly vertices,
    // depending on clipping factor, which is the distance between
    // the two parent meshes
    return mix(p, p2, _vClipFactor);
}
`;

let initialize = `
/**
 * Initialize variables, translating the vertex position and calculating elevation
 * This function should be called at the beginning of your vertex shader
 */
void initialize() {
    _vPosition = clipSides(getPosition(cPosition));
    _vElevation = getElevation(heightmap, _vPosition);

    _vPosition.z = _vElevation;
}
`;

// precision highp int;
// precision highp float;
// uniform mat4 modelViewMatrix;
// uniform mat4 projectionMatrix;
//
// attribute vec2 uv;
// attribute vec3 normal;
// attribute vec3 position;

let vShader = `
uniform sampler2D  texture;
uniform sampler2D  heightmap;
uniform int        nodeEdge;
uniform float      nodeScale;
uniform vec3       cPosition;
uniform vec3       nodePosition;

// Share these as required to fragmentshader
vec3  _vPosition;
float _vElevation;
float _vClipFactor;
`
            + rand
            + getUv
            + getElevation
            + getPosition
            + clipSides
            + initialize;

let fShader = `
uniform vec3 nodePosition;
uniform sampler2D  texture;
uniform sampler2D  heightmap;
`
            + rand
            + getUv
            + getElevation;


let defaultVShader = `

varying vec3 currentVertexPosition;
void main() {
    // Required by Terrain
    // Calling this initializes our parameters
    initialize();

    currentVertexPosition = _vPosition;

    // Output the position
    gl_Position = projectionMatrix * modelViewMatrix * vec4(_vPosition, 1.);
}
`;

let defaultFShader = `

varying vec3 currentVertexPosition;
void main() {
    gl_FragColor = texture2D(texture, getUv(currentVertexPosition));
}
`;

function buildShader(includes, defaultShader, userShader) {
    return (userShader) ? includes + userShader : includes + defaultShader;
}

export default class TerrainShaderMaterial extends ShaderMaterial {
    constructor(options = {}) {

        // We're cloning the material
        if (! Object.getOwnPropertyNames(options).length) {
            return super();
        }

        // Shallow copy to make sure we don't overwrite ptr values
        let shaderOptions = { ...options };

        // Uniforms change on each node, and will be updated when we clone this shader
        shaderOptions.uniforms = TerrainShaderMaterial.getUniforms(options);

        // Definitions do not change during the execution of our program
        // Allow the user to insert their own definitions here
        shaderOptions.defines  = TerrainShaderMaterial.getDefines(options);

        // Build a shader or use a default shader
        shaderOptions.vertexShader   = buildShader(vShader, defaultVShader, options.vertexShader);
        shaderOptions.fragmentShader = buildShader(fShader, defaultFShader, options.fragmentShader);

        super(shaderOptions);

        // For debugging
        this.type = 'TerrainShaderMaterial';
    }

    static getUniforms(node) {

        let texture, heightmap;

        if (node.uniforms && node.uniforms.texture)
            texture = node.uniforms.texture.texture || node.uniforms.texture;

        if (node.uniforms.heightmap)
            heightmap = node.uniforms.heightmap.texture || node.uniforms.heightmap;

        // Build the uniforms object with default values and user values
        return {
            ...node.uniforms,
            texture:      { type: 't',  value: texture },
            heightmap:    { type: 't',  value: heightmap },
            nodeEdge:     { type: 'i',  value: node.uniforms.nodeEdge },
            cPosition:    { type: 'v3', value: node.uniforms.cPosition },
            nodeScale:    { type: 'f',  value: node.uniforms.nodeScale },
            nodePosition: { type: 'v3', value: node.uniforms.nodePosition },
        }
    }

    static getDefines(node) {

        // Prevent errors if we've already loded the shader
        String.prototype.toFixed = function() { return this };

        // throw node;
        return {
            ...node.defines,
            CLIP_EDGE:     node.defines.CLIP_EDGE.toFixed(1),
            ELEVATION:     node.defines.ELEVATION.toFixed(1),
            TESSELATION:   node.defines.TESSELATION.toFixed(1),
            WORLD_SIZE_X:  node.defines.WORLD_SIZE_X.toFixed(1),
            WORLD_SIZE_Y:  node.defines.WORLD_SIZE_Y.toFixed(1),
            VIEWPORT_SIZE: node.defines.VIEWPORT_SIZE.toFixed(1),
        };

    }

    static mixUniforms(shader, options = {}) {

        let newUniforms = TerrainShaderMaterial.getUniforms(options);

        shader.uniforms = {
            ...shader.uniforms,
            ...newUniforms
        };
    }

    clone(options = {}) {
        let newShader = super.clone();

        TerrainShaderMaterial.mixUniforms(newShader, options);

        return newShader;
    }
}
