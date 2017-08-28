"use strict";

import Texture from '../../Texture'
import Utils from '../../../../Modules/Utils'

let vShader = `
varying vec2 vUv;
void main() {

    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

`;

let fShader = `

const float PI     = 3.1415926;
const float twoPI  = 6.2831853;
const float halfPI = 1.570796325;

varying vec2 vUv;

uniform float      sMin;
uniform float      sMax;
uniform sampler2D  texture;
uniform vec3       pPosition;
uniform float      tesselation;

void main() {
    if (vUv.x < 0.01 || vUv.x > 0.99 || vUv.y < 0.01 || vUv.y > 0.99)
        gl_FragColor = vec4(1.0);

    else
        gl_FragColor = texture2D(texture, vUv);
}
`;

export default function(options) {
    let uniforms = {
        time:          { value: 0 },
        pPosition:     { value: options.pos },
        sMin:          { value: options.sMin },
        sMax:          { value: options.sMax },
        tesselation:   { value: options.tesselation },
        texture:       { value: options.texture.texture || options.texture },
    };

    return new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: vShader,
        fragmentShader: fShader,
    });
}
