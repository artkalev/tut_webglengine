var engine = {
    activeProgram : null
};

var gl = null; // we are going to use "gl" a LOT, so it is best to have a short var name.
engine.canvas = null;

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
    // All is going well, lets put our canvas on the screen
    document.body.appendChild(engine.canvas);
};

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
};

engine.GLProgram = class GLProgram{
    constructor( vertexShader, fragmentShader ){
        this.vertexShader = vertexShader;
        this.fragmentShader = fragmentShader;
        this.program = null;
        this.attributes = {};
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

    GetAttribLocation(name){
        if(this.attributes[name] === undefined /* location can be '0' */ ){
            this.attributes[name] = gl.getAttribLocation(this.program, name);
        }
        return this.attributes[name];
    }

    Use(){
        gl.useProgram(this.program);
        engine.activeProgram = this;
    }
};

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

        // finally draw triangles
        console.log(this);
        gl.drawArrays( gl.TRIANGLES, 0, this.vertexCount );
    }
}