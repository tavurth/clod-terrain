
// import Noise from '../Noise/noise2D'
let Noise = '';
let terrain = Noise + `

const mat2 m = mat2(0.8,-0.6,0.6,0.8);
float terrain(vec2 p) {
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

`;
