var engine = {
    canvas : null,
    activeProgram : null,
    activeCamera : null,
    scene : null,
    time : Date.now()/1000.0
};

var gl = null; // we are going to use "gl" a LOT, so it is best to have a short var name.

engine.Init = function(){
    engine.canvas = document.createElement("canvas"); 
    gl = engine.canvas.getContext("webgl");
    if(!gl){
        // webgl context failed to initialize
        // lets display a nice message to let the user know. 
        var noglmsg = document.createElement("h3");
        noglmsg.innerHTML = "Your browser / hardware does not seem to support webgl<br>";
        noglmsg.innerHTML += "<a href='https://get.webgl.org/'>More Info ...</a>";
        document.body.appendChild(noglmsg);
        return; //All is doomed, abort Init()
    }
    // adding css properties to the canvas
    engine.canvas.style.width = "100%";
    engine.canvas.style.height = "100%";
    engine.canvas.style.position = "fixed";
    engine.canvas.style.left = "0px";
    engine.canvas.style.top = "0px";
    // All is going well, lets put our canvas on the screen
    document.body.appendChild(engine.canvas);
    window.addEventListener("resize", engine.Resize);
    

    engine.viewMatrix = new Mat4().SetIdentity();
    engine.projMatrix = new Mat4().SetIdentity();

    engine.scene = new engine.Scene();
    engine.Resize(); // set canvas to right size at start
    engine.Update(); // starting mainloop
};

engine.Update = function(){
    engine.time = Date.now()/1000.0;
    engine.scene.Update();
    if(engine.activeCamera != null){
        engine.activeCamera.Render(engine.scene);
    }
    requestAnimationFrame(engine.Update);
};

engine.Resize = function(){
    engine.canvas.width = window.innerWidth;
    engine.canvas.height = window.innerHeight;
};

class Vec3{
    constructor( x,y,z ){
        this.data = new Float32Array([x||0,y||0,z||0]);
    }
    get x(){ return this.data[0]; } set x(val){ this.data[0] = val; }
    get y(){ return this.data[1]; } set y(val){ this.data[1] = val; }
    get z(){ return this.data[2]; } set z(val){ this.data[2] = val; }
    
    Set(x,y,z){
        this.data[0] = x;
        this.data[1] = y;
        this.data[2] = z;
    }

    Length(){
        return Math.sqrt( this.LengthSqr() );
    }
    LengthSqr(){
        return this.data[0]*this.data[0]+this.data[1]*this.data[1]+this.data[2]*this.data[2]
    }
    Normalize(){
        var l = this.Length();
        if(l == 0){ return this; }
        this.data[0] /= l;
        this.data[1] /= l;
        this.data[2] /= l;
        return this;
    }
}

class Quat{
    constructor(){
        this.data = new Float32Array([ 0.0, 0.0, 0.0, 1.0 ]);        
    }

    SetEuler( bank, heading, attitude ){
        var c1 = Math.cos(heading);
        var s1 = Math.sin(heading);
        var c2 = Math.cos(attitude);
        var s2 = Math.sin(attitude);
        var c3 = Math.cos(bank);
        var s3 = Math.sin(bank);
        this.data[3] = Math.sqrt(1.0 + c1 * c2 + c1*c3 - s1 * s2 * s3 + c2*c3) / 2.0;
        var w4 = (4.0 * this.data[3]);
        this.data[0] = (c2 * s3 + c1 * s3 + s1 * s2 * c3) / w4 ;
        this.data[1] = (s1 * c2 + s1 * c3 + c1 * s2 * s3) / w4 ;
        this.data[2] = (-s1 * s3 + c1 * s2 * c3 +s2) / w4 ;
    }

    GetEuler(){
        var test = q1.x*q1.y + q1.z*q1.w;
        if (test > 0.499) { // singularity at north pole
            var heading = 2 * atan2(q1.x,q1.w);
            var attitude = Math.PI/2;
            var bank = 0;
            return [ heading, attitude, bank ];
        }
        if (test < -0.499) { // singularity at south pole
            var heading = -2 * atan2(q1.x,q1.w);
            var attitude = - Math.PI/2;
            var bank = 0;
            return [ heading, attitude, bank ];
        }
        var sqx = q1.x*q1.x;
        var sqy = q1.y*q1.y;
        var sqz = q1.z*q1.z;
        var heading = atan2(2*q1.y*q1.w-2*q1.x*q1.z , 1 - 2*sqy - 2*sqz);
        var attitude = asin(2*test);
        var bank = atan2(2*q1.x*q1.w-2*q1.y*q1.z , 1 - 2*sqx - 2*sqz);
        return [ heading, attitude, bank ];
    }

    GetMat4(){
        var m = new Mat4();
        var xx = this.data[0] * this.data[0];
        var xy = this.data[0] * this.data[1];
        var xz = this.data[0] * this.data[2];
        var xw = this.data[0] * this.data[3];
    
        var yy = this.data[1] * this.data[1];
        var yz = this.data[1] * this.data[2];
        var yw = this.data[1] * this.data[3];
    
        var zz = this.data[2] * this.data[2];
        var zw = this.data[2] * this.data[3];
    
        m.m00  = 1 - 2 * ( yy + zz );
        m.m01  =     2 * ( xy - zw );
        m.m02 =     2 * ( xz + yw );
        
        m.m10  =     2 * ( xy + zw );
        m.m11  = 1 - 2 * ( xx + zz );
        m.m12  =     2 * ( yz - xw );
        
        m.m20  =     2 * ( xz - yw );
        m.m21  =     2 * ( yz + xw );
        m.m22 = 1 - 2 * ( xx + yy );

        m.m33 = 1.0;
        return m;
    }
}

class Mat4{   
    /* column major formatted
        +----+----+----+----+
        |  0 |  4 |  8 | 12 |
        +----+----+----+----+
        |  1 |  5 |  9 | 13 |
        +----+----+----+----+
        |  2 |  6 | 10 | 14 |
        +----+----+----+----+
        |  3 |  7 | 11 | 15 |
        +----+----+----+----+

        +-----+-----+-----+-----+
        | m00 | m01 | m02 | m03 |
        +-----+-----+-----+-----+
        | m10 | m11 | m12 | m13 |
        +-----+-----+-----+-----+
        | m20 | m21 | m22 | m23 |
        +-----+-----+-----+-----+
        | m30 | m31 | m32 | m33 |
        +-----+-----+-----+-----+

        +----+----+----+----+
        | Xx | Yx | Zx | Tx |
        +----+----+----+----+
        | Xy | Yy | Zy | Ty |
        +----+----+----+----+
        | Xz | Yz | Zz | Tz |
        +----+----+----+----+
        |    |    |    |    |
        +----+----+----+----+
    */
    
    constructor(){
        // 1D array, because it can be passed
        // to WebGL shader as is.
        this.data = new Float32Array(16);
        return this;
    }
    /* getters and setters in "mxx" format for more convenient element access */
    get m00(){ return this.data[ 0]; } set m00(val){ this.data[ 0] = val; }
    get m01(){ return this.data[ 4]; } set m01(val){ this.data[ 4] = val; }
    get m02(){ return this.data[ 8]; } set m02(val){ this.data[ 8] = val; }
    get m03(){ return this.data[12]; } set m03(val){ this.data[12] = val; }

    get m10(){ return this.data[ 1]; } set m10(val){ this.data[ 1] = val; }
    get m11(){ return this.data[ 5]; } set m11(val){ this.data[ 5] = val; }
    get m12(){ return this.data[ 9]; } set m12(val){ this.data[ 9] = val; }
    get m13(){ return this.data[13]; } set m13(val){ this.data[13] = val; }

    get m20(){ return this.data[ 2]; } set m20(val){ this.data[ 2] = val; }
    get m21(){ return this.data[ 6]; } set m21(val){ this.data[ 6] = val; }
    get m22(){ return this.data[10]; } set m22(val){ this.data[10] = val; }
    get m23(){ return this.data[14]; } set m23(val){ this.data[14] = val; }

    get m30(){ return this.data[ 3]; } set m30(val){ this.data[ 3] = val; }
    get m31(){ return this.data[ 7]; } set m31(val){ this.data[ 7] = val; }
    get m32(){ return this.data[11]; } set m32(val){ this.data[11] = val; }
    get m33(){ return this.data[15]; } set m33(val){ this.data[15] = val; }
    
    Set( data ){
        this.data.set(data);
        return this;
    }

    SetIdentity(){ this.data.set([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); return this; }

    Multiply( other ){
        var d = [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0];
        /* multiply rows and columns using loops */
        for( var x = 0; x < 4; x++ ){
            for( var y = 0; y < 4; y++ ){
                for( var z = 0; z < 4; z++ ){
                    d[x+y*4] += other.data[x+z*4] * this.data[z+y*4];
                }
            }
        }
        this.data.set(d);
        return this;
    }

    TRS( translation, rotation, scale ){
        var T = new Mat4().Set([
            1               ,0              ,0              ,0,
            0               ,1              ,0              ,0,
            0               ,0              ,1              ,0,
            translation.x   , translation.y , translation.z ,1
        ]);
        var R = rotation.GetMat4();
        this.Set([
            scale.x , 0       , 0       , 0 ,
            0       , scale.y , 0       , 0 ,
            0       , 0       , scale.z , 0 ,
            0       , 0       , 0       , 1
        ]);
        this.Multiply( R );
        this.Multiply( T );
        return this;
    }

    Copy( other ){
        this.data.set(other.data);
        return this;
    }

    Perspective( aspect, fov, near, far ){
        // set the basic projection matrix
        this.SetIdentity();
        var scale = 1 / Math.tan(fov * 0.5 * Math.PI / 180); 
        this.m00 = scale; // scale the x coordinates of the projected point 
        this.m11 = scale * aspect; // scale the y coordinates of the projected point 
        this.m22 = -far / (far - near); // used to remap z to [0,1]
        this.m23 = -far * near / (far - near); // used to remap z [0,1] 
        this.m32 = -1; // set w = -z
        this.m33 = 0; 
    }
}

engine.GLShader = class GLShader{
    constructor( source, type ){
        this.source = source;
        this.type = type; // gl.VERTEX_SHADER or gl.FRAGMENT_SHADER
        this.shader = null;
    }

    Compile(){
        if(this.shader == null){
            this.shader = gl.createShader( this.type );
        }
        gl.shaderSource(this.shader, this.source);
        gl.compileShader(this.shader);
        if ( !gl.getShaderParameter(this.shader, gl.COMPILE_STATUS) ) {
            var info = gl.getShaderInfoLog( this.shader );
            throw 'Could not compile WebGL shader. \n\n' + info;
        }
    }
}

engine.GLProgram = class GLProgram{
	constructor( vertexShader, fragmentShader ){
		this.vertexShader = vertexShader;
		this.fragmentShader = fragmentShader;
        this.program = null;
        this.attributes = {};
        this.uniforms = {};
        this.useDepth = true;
        this.depthFunc = gl.LEQUAL;
	}
	
	Compile(){
		if(this.program == null){
			this.program = gl.createProgram();
		}
		gl.attachShader(this.program, this.vertexShader.shader);
		gl.attachShader(this.program, this.fragmentShader.shader);
		gl.linkProgram(this.program);
		
		if ( !gl.getProgramParameter( this.program, gl.LINK_STATUS) ) {
			var info = gl.getProgramInfoLog(this.program);
			throw 'Could not compile WebGL program. \n\n' + info;
		}
    }

    GetUnifLocation(name){
        if(this.uniforms[name] === undefined /* location can be '0' */ ){
            this.uniforms[name] = gl.getUniformLocation(this.program, name);
        }
        return this.uniforms[name];
    }

    GetAttribLocation(name){
        if(this.attributes[name] === undefined /* location can be '0' */ ){
            this.attributes[name] = gl.getAttribLocation(this.program, name);
        }
        return this.attributes[name];
    }

    SetUniform(name, value, type){
        var loc = this.GetUnifLocation(name);
        if(loc != -1 && value !== undefined){
            switch(type){
                case "m4": gl.uniformMatrix4fv( loc, false, value ); break;
            }
        }
    }

    Use(){
        gl.useProgram(this.program);
        engine.activeProgram = this;
        if(this.useDepth == true){
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(this.depthFunc);
        }
    }
}

engine.Mesh = class Mesh{
    constructor( attributes ){
        this.attributes = attributes;
        this.vertexCount = 0;
    }

    Init(){
        // this should be used sparingly. certainly not on every frame!
        for(var name in this.attributes){
            var a = this.attributes[name];
            a.buffer = gl.createBuffer();
            // fill missing values with defaults
            if(a.size === undefined){ a.size = 3; }
            if(a.normalized === undefined){ a.normalized = false; }
            if(a.usage === undefined){ a.usage = gl.STATIC_DRAW; }
            if(a.type === undefined){ a.type = gl.FLOAT; }
            if(a.data === undefined){ a.data = null; }
            gl.bindBuffer( gl.ARRAY_BUFFER, a.buffer );
            // writing attribute data to GPU
            gl.bufferData(
                gl.ARRAY_BUFFER,
                a.data, // flat js typed array
                a.usage // gl.STATIC_DRAW most often
            );
            gl.bindBuffer( gl.ARRAY_BUFFER, null);
            if(name == "position"){ 
                this.vertexCount = a.data.length / a.size; 
            }
            this.attributes[name] = a;
        }
    }

    Draw(){
        // engine.activeProgram must be set before Drawing this
        if(engine.activeProgram == null){ return; }
        // setting up attributes

        // if there is nothing to draw, abort
        if(this.vertexCount == 0){ return; }

        for(var name in this.attributes){
            var loc = engine.activeProgram.GetAttribLocation(name);
            // if the shaderprogram does not have this attribute skip it;
            // if there is no 'position' attribute in shader program
            // abort drawing.
            if(loc == -1){ if(name == "position"){ return; }else{ continue; } }
            
            gl.bindBuffer( gl.ARRAY_BUFFER, this.attributes[name].buffer );
            gl.enableVertexAttribArray( loc );
            gl.vertexAttribPointer( 
                loc, 
                this.attributes[name].size, 
                this.attributes[name].type, 
                this.attributes[name].normalized, 
                0, 0 
            );
        }

        // finally draw triangles\
        gl.drawArrays( gl.TRIANGLES, 0, this.vertexCount );
    }
}

engine.Obj = class Obj{
    constructor(){
        this.localPosition = new Vec3(0,0,0);
        this.localRotation = new Quat();
        this.localScale = new Vec3(1,1,1);
        this.localToWorld = new Mat4();
        this.parent = null;
        this.children = [];
        this.matrixNeedsUpdate = true;
        this.mesh = null;
        this.program = null;

        this.onupdate = function(){};
    }

    SetParent( obj ){
        this.parent = obj;
        obj.children.push(this);
    }

    UpdateMatrix(){
        this.localToWorld.TRS( this.localPosition, this.localRotation, this.localScale );
        if(this.parent != null){
            this.localToWorld.Multiply( this.parent.localToWorld );
        }
        for(var i = 0; i < this.children.length; i++){
            this.children[i].matrixNeedsUpdate = true;
        }
        this.matrixNeedsUpdate = false;
    }

    Update(){
        this.onupdate();
        if(this.matrixNeedsUpdate){
            this.UpdateMatrix();
        }
    }

    Draw(){
        this.program.Use();
        this.program.SetUniform("modelMatrix", this.localToWorld.data, "m4");
        this.program.SetUniform("viewMatrix", engine.activeCamera.viewMatrix.data, "m4");
        this.program.SetUniform("projMatrix", engine.activeCamera.projMatrix.data, "m4");
        this.mesh.Draw();
    }
}

engine.Camera = class Camera extends engine.Obj{
    constructor(){
        super();
        this.target = null; /* future... */
        this.fov = 90;
        this.near = 0.1;
        this.far = 1000.0;
        this.aspect = 1;
        this.width = engine.canvas.width;
        this.height = engine.canvas.height;
        this.viewMatrix = new Mat4();
        this.projMatrix = new Mat4();
        this.UpdateProjection();
    }

    UpdateProjection(){
        this.projMatrix.Perspective( this.aspect, this.fov, this.near, this.far );
    }

    Update(){
        super.Update();
        if(this.width != engine.canvas.width || this.height != engine.canvas.height ){
            this.width = engine.canvas.width;
            this.height = engine.canvas.height;
            this.aspect = this.width / this.height;
            this.UpdateProjection();
        }
    }

    UpdateMatrix(){
        super.UpdateMatrix();
        this.viewMatrix.Copy( this.localToWorld );
        this.viewMatrix.m03 *= -1;
        this.viewMatrix.m13 *= -1;
        this.viewMatrix.m23 *= -1;
    }

    Draw(){
        // camera is invisible
    }

    /*
        Implemented in a way that would enable
        "manual" rendering through camera.
        This is useful for rendering to
        textures later.
    */
    Render( scene ){
        engine.activeCamera = this;
        gl.viewport( 0,0, engine.canvas.width, engine.canvas.height );
        gl.clearColor(
            scene.backgroundColor[0],
            scene.backgroundColor[1],
            scene.backgroundColor[2],
            scene.backgroundColor[3]
        );
        gl.clear( gl.COLOR_BUFFER_BIT || gl.DEPTH_BUFFER_BIT );
        scene.Draw();
    }
}

engine.Scene = class Scene{
    constructor(){
        this.backgroundColor = [ 0.3, 0.3, 0.3, 1.0 ];
        // creating and assigning a default camera
        // for conveniences' sake
        // normally only one scene is used at one time anyway
        this.objects = [ new engine.Camera() ];
        engine.activeCamera = this.objects[0];
        this.objects[0].localPosition.z = 1;
    }

    Add(obj){
        this.objects.push( obj );
        return obj;
    }

    Update(){
        for(var i = 0; i < this.objects.length; i++){
            this.objects[i].Update();
        }
    }

    Draw(){
        for(var i = 0; i < this.objects.length; i++){
            this.objects[i].Draw();
        }
    }
}