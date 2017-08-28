"use strict";

import Texture from '../../Texture'
import Utils from '../../../../Modules/Utils'

let uniforms = {
    mapseed: { value: null },
};

let vShader = `
varying vec2 vUv;
void main() {

    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}
`;

import Noise from '../Noise/noise2D'

let fShader = Noise + `

const mat2 m = mat2(0.8,-0.6,0.6,0.8);
float terrain(vec2 p)
{
    float a = 0.;
    float b = 1.;
    vec2  d = vec2(0.);
    for(int i=0; i < 5; i++) {
        vec3 n = vec3(snoise(p));
        d += n.yz;
        a += b*n.x/(1.+dot(d,d));
        b *= 0.5;
        p = m*p*2.;
    }
    return a;
}


const float PI     = 3.1415926;
const float twoPI  = 6.2831853;
const float halfPI = 1.570796325;

varying vec2 vUv;

uniform float      time;
uniform float      size;
uniform float      sMin; // Our total world size for Uv coordinates
uniform float      sMax;
uniform sampler2D  mapseed;
uniform vec3       pPosition; // Parent mesh position
uniform float      tesselation;

vec2 calcUv() {
    vec3 vPosition = vec3(0.0);

    // Calculating translated vertex position and normal from the sphere center
    vec3 vCenterN = normalize(vPosition + pPosition - vec3(0.,0.,0.0));

    // Converting the normal to cartesian coordinates based on the sphere size
    float u = (atan(vCenterN.z, vCenterN.x) / twoPI + 0.5);
    float v = (vCenterN.y * 0.5 + 0.5);

    return vec2(u,v);
}

void main() {
    gl_FragColor = texture2D(mapseed, vUv);
}
`;

export default function(options) {

    let uniforms = {
        time:          { value: 0 },
        pPosition:     { value: options.pos },
        size:          { value: options.size },
        sMin:          { value: options.sMin },
        sMax:          { value: options.sMax },
        tesselation:   { value: options.tesselation },
        mapseed:       { value: options.mapseed.texture || options.mapseed },
    };

    return new THREE.ShaderMaterial({
        depthWrite: false,
        transparent: true,
        uniforms: uniforms,
        vertexShader: vShader,
        fragmentShader: fShader,
    })
}
